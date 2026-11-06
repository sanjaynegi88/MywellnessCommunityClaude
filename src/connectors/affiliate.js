// Affiliate network connectors. Each returns offers in one normalised shape:
//   { extKey, network, name, advertiser, category, markets, commission, url, joined, raw }
// Connectors never apply to programmes or change account state: applying is a human step
// (brief, Stage 5). They only READ programme lists, programme terms and performance.
const { request } = require('../lib/http');
const config = require('../config');

const c = config.connectors;
const dateOnly = (d) => d.toISOString().slice(0, 10);

/* ---------------- Awin (Publisher API) ----------------
   Auth: Bearer token from Awin UI (Toolbox → API credentials). */
const awin = {
  name: 'Awin',
  configured: () => !!(c.awin.token && c.awin.publisherId),
  async programmes({ countryCode = 'GB', relationship = 'notjoined' } = {}) {
    const list = await request(`https://api.awin.com/publishers/${c.awin.publisherId}/programmes`, {
      headers: { Authorization: `Bearer ${c.awin.token}` }, query: { relationship, countryCode },
    });
    return (list || []).map(p => ({
      extKey: `awin:${p.id}`, network: 'Awin', name: p.name, advertiser: p.name,
      category: p.primarySector?.name || p.primarySector || '', markets: countryToMarket(p.primaryRegion?.countryCode || countryCode),
      commission: '', url: p.displayUrl || '', joined: relationship === 'joined', raw: p,
    }));
  },
  async programmeDetails(advertiserId) {
    return request(`https://api.awin.com/publishers/${c.awin.publisherId}/programmedetails`, {
      headers: { Authorization: `Bearer ${c.awin.token}` }, query: { advertiserId, relationship: 'any' },
    });
  },
  async transactions(days = 7) {
    const end = new Date(); const start = new Date(Date.now() - days * 864e5);
    return request(`https://api.awin.com/publishers/${c.awin.publisherId}/transactions/`, {
      headers: { Authorization: `Bearer ${c.awin.token}` },
      query: { startDate: start.toISOString().slice(0, 19), endDate: end.toISOString().slice(0, 19), timezone: 'UTC' },
    });
  },
};

/* ---------------- Impact (Partner / Mediapartners API) — Chewy, Petco ----------------
   Auth: HTTP Basic AccountSID:AuthToken. */
const impact = {
  name: 'Impact',
  configured: () => !!(c.impact.accountSid && c.impact.authToken),
  auth: () => 'Basic ' + Buffer.from(`${c.impact.accountSid}:${c.impact.authToken}`).toString('base64'),
  async programmes() {
    const r = await request(`https://api.impact.com/Mediapartners/${c.impact.accountSid}/Campaigns`, { headers: { Authorization: impact.auth() }, query: { PageSize: 100 } });
    return (r?.Campaigns || []).map(p => ({
      extKey: `impact:${p.CampaignId}`, network: /petco/i.test(p.CampaignName) ? 'Petco (Impact)' : /chewy/i.test(p.CampaignName) ? 'Chewy (Impact)' : 'Impact',
      name: p.CampaignName, advertiser: p.AdvertiserName || p.CampaignName, category: '', markets: 'USA',
      commission: '', url: p.CampaignUrl || '', joined: /active|joined/i.test(p.ContractStatus || ''), raw: p,
    }));
  },
  async actions(days = 7) {
    return request(`https://api.impact.com/Mediapartners/${c.impact.accountSid}/Actions`, {
      headers: { Authorization: impact.auth() },
      query: { ActionDateStart: new Date(Date.now() - days * 864e5).toISOString().slice(0, 19) + 'Z', ActionDateEnd: new Date().toISOString().slice(0, 19) + 'Z', PageSize: 1000 },
    });
  },
};

/* ---------------- Digistore24 ----------------
   VERIFY ON FIRST RUN: function names come from Digistore24's API reference
   (listMarketplaceEntries / getMarketplaceEntry); confirm the base URL and key header
   in your account's API settings before enabling. */
const digistore24 = {
  name: 'Digistore24',
  configured: () => !!c.digistore24.apiKey,
  async call(fn, query = {}) {
    const r = await request(`https://www.digistore24.com/api/call/${fn}`, { headers: { 'X-DS-API-KEY': c.digistore24.apiKey }, query });
    if (r && r.result && r.result !== 'success') throw new Error(`Digistore24 ${fn}: ${r.message || r.result}`);
    return r?.data ?? r;
  },
  async programmes() {
    const data = await digistore24.call('listMarketplaceEntries');
    const entries = data?.entries || data?.marketplace_entries || (Array.isArray(data) ? data : []);
    return entries.map(e => ({
      extKey: `digistore24:${e.id || e.entry_id}`, network: 'Digistore24', name: e.name || e.headline || e.product_name,
      advertiser: e.vendor_name || '', category: e.category || '', markets: 'All',
      commission: e.commission ? `${e.commission}%` : '', url: e.affiliate_support_url || e.salespage_url || '', joined: false, raw: e,
    }));
  },
};

/* ---------------- ClickBank ----------------
   Discovery: ClickBank's downloadable marketplace feed (zipped XML, CLICKBANK_FEED_URL).
   VERIFY ON FIRST RUN that the feed URL is still published; if not, upload a marketplace
   export via POST /api/offers/import. Analytics: ClickBank API (confirm path & header in
   ClickBank → API Management). */
function parseClickbankFeed(xml) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  $('Category').each((_, cat) => {
    const catName = $(cat).children('Name').first().text();
    $(cat).find('Site').each((__, s) => {
      const $s = $(s); const id = $s.children('Id').text();
      if (!id) return;
      out.push({
        extKey: `clickbank:${id}`, network: 'ClickBank', name: $s.children('Title').text() || id, advertiser: id,
        category: $s.parents('Category').map((i, el) => $(el).children('Name').first().text()).get().reverse().join(' › ') || catName,
        markets: 'All', commission: $s.children('Commission').text() ? `${$s.children('Commission').text()}%` : '',
        metric: `gravity ${$s.children('Gravity').text() || '?'}; avg $/sale ${$s.children('AverageEarningsPerSale').text() || '?'}`,
        url: `https://${id}.pay.clickbank.net`, joined: false,
        raw: { description: $s.children('Description').text().slice(0, 500), gravity: Number($s.children('Gravity').text()) || 0, hasRebill: $s.children('HasRecurringProducts').text() },
      });
    });
  });
  return [...new Map(out.map(o => [o.extKey, o])).values()];
}
const clickbank = {
  name: 'ClickBank',
  configured: () => !!((c.clickbank.feedEnabled && c.clickbank.feedUrl) || (c.clickbank.apiKey && c.clickbank.account)),
  async programmes() {
    if (!c.clickbank.feedEnabled || !c.clickbank.feedUrl) return [];
    const res = await fetch(c.clickbank.feedUrl);
    if (!res.ok) throw new Error(`ClickBank feed HTTP ${res.status}`);
    let buf = Buffer.from(await res.arrayBuffer());
    if (buf[0] === 0x50 && buf[1] === 0x4b) { const AdmZip = require('adm-zip'); const entry = new AdmZip(buf).getEntries().find(e => /\.xml$/i.test(e.entryName)); buf = entry.getData(); }
    // keep only reasonably popular products (gravity ≥ 5) to avoid noise
    return parseClickbankFeed(buf.toString('utf8')).filter(p => (p.raw.gravity || 0) >= 5);
  },
  async analytics(days = 7) {
    if (!(c.clickbank.apiKey && c.clickbank.account)) return null;
    return request('https://api.clickbank.com/rest/1.3/analytics/affiliate/vendor', {
      headers: { Authorization: c.clickbank.apiKey },
      query: { account: c.clickbank.account, startDate: dateOnly(new Date(Date.now() - days * 864e5)), endDate: dateOnly(new Date()) },
    });
  },
};

function countryToMarket(cc) { return { US: 'USA', GB: 'UK', UK: 'UK' }[cc] || (cc ? 'EU' : ''); }

module.exports = { awin, impact, digistore24, clickbank, parseClickbankFeed, all: [awin, impact, digistore24, clickbank] };
