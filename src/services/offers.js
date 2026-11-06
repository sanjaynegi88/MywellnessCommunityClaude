// Stage 4 + Stage 5: affiliate offer discovery, evaluation and the mandatory human approval gateway.
const { repo } = require('../db');
const ai = require('../lib/ai');
const config = require('../config');
const { audit } = require('../lib/audit');
const networks = require('../connectors/affiliate');
const tasks = require('./tasks');
const log = require('../logger');

const offers = repo('offers');

const STATUSES = ['Discovered', 'Under evaluation', 'Shortlisted', 'Approval pending', 'Approved', 'Active', 'Paused', 'Rejected', 'Expired / withdrawn'];
const NEXT = {
  'Discovered': ['Under evaluation', 'Rejected'],
  'Under evaluation': ['Shortlisted', 'Rejected'],
  'Shortlisted': ['Approval pending', 'Rejected'],
  'Approval pending': ['Approved', 'Rejected'],
  'Approved': ['Active', 'Paused', 'Rejected'],
  'Active': ['Paused', 'Expired / withdrawn', 'Rejected'],
  'Paused': ['Active', 'Expired / withdrawn', 'Rejected'],
  'Rejected': ['Under evaluation'],
  'Expired / withdrawn': ['Under evaluation'],
};
// The only moves the AI/automation may make on its own. Everything from Shortlisted onwards is human.
const SYSTEM_ALLOWED = new Set(['Discovered>Under evaluation', 'Under evaluation>Shortlisted']);
const PROMOTABLE = new Set(['Active']);

const RELEVANT = /supplement|vitamin|nutri|health|wellness|well-being|pet|dog|cat|vet|probiotic|collagen|protein|herbal|organic|natural|omega|joint|sleep|immune|skin|beauty|keto|digest|zoo|chewy|petco|food/i;
const PET = /pet|dog|cat|puppy|kitten|vet|zoo|chewy|petco|canine|feline|aquarium|bird/i;

/** Is the network allowed at all? (e.g. Petco application rejected → keep inactive) */
async function networkBlocked(network) {
  const plats = await repo('platforms').list();
  const p = plats.find(x => String(network || '').toLowerCase().includes(String(x.name || '').toLowerCase().split(' ')[0]));
  return p && p.accountStatus === 'Rejected' ? `${p.name}: application rejected — keep inactive until a new application is approved` : null;
}

/**
 * Change an offer's status. actor = req.user (human) or {name:'automation', system:true}.
 * Activation requires a human approver and explicit confirmations (the "activation signal").
 */
async function transition(id, to, actor, payload = {}) {
  const o = await offers.get(id);
  if (!o) throw Object.assign(new Error('Offer not found'), { status: 404 });
  if (!STATUSES.includes(to)) throw Object.assign(new Error(`Unknown status ${to}`), { status: 400 });
  if (!(NEXT[o.status] || []).includes(to)) throw Object.assign(new Error(`Cannot move from ${o.status} to ${to}`), { status: 409 });
  if (actor.system && !SYSTEM_ALLOWED.has(`${o.status}>${to}`)) throw Object.assign(new Error(`Automation may not move an offer to ${to}; a person must do this`), { status: 403 });
  if (['Approved', 'Active'].includes(to) && !['approver', 'admin'].includes(actor.role)) throw Object.assign(new Error(`Only an approver can move an offer to ${to}`), { status: 403 });
  if (['Approved', 'Active'].includes(to)) {
    const blocked = await networkBlocked(o.network);
    if (blocked) throw Object.assign(new Error(blocked), { status: 409 });
  }
  const patch = { status: to };
  if (to === 'Active') {
    const c = payload.confirmations || {};
    if (!(c.approvedByNetwork && c.trafficRulesChecked && c.trackingLinkInPlace)) throw Object.assign(new Error('Confirm network approval, permitted traffic and tracking link before activating'), { status: 400 });
    if (!payload.affiliateLink) throw Object.assign(new Error('Affiliate tracking link is required'), { status: 400 });
    Object.assign(patch, { activatedAt: new Date().toISOString(), activatedBy: actor.name, approvalRef: payload.approvalRef || '', affiliateLink: payload.affiliateLink, permittedTraffic: payload.permittedTraffic || o.traffic || '' });
  }
  if (to === 'Approval pending') patch.appliedAt = new Date().toISOString();
  if (['Paused', 'Rejected', 'Expired / withdrawn'].includes(to)) Object.assign(patch, { deactivatedAt: new Date().toISOString(), deactivationReason: payload.reason || '' });
  const updated = await offers.update(id, patch);
  await audit(actor, `offer → ${to}`, `offer:${id}`, { name: o.name, from: o.status, ...payload, affiliateLink: undefined });
  if (o.status === 'Active' && !PROMOTABLE.has(to)) await require('./content').onOfferDeactivated(id, actor);
  if (to === 'Shortlisted') await tasks.add(`apply:${id}`, { title: `Apply to ${o.network} for "${o.name}"`, detail: `AI score ${o.score ?? '—'}. Apply manually, then move the offer to "Approval pending".`, module: 'approvals', ref: `offer:${id}`, priority: 'High', role: 'approver' });
  if (to === 'Approval pending') await tasks.done(`apply:${id}`);
  if (to === 'Approved') await tasks.add(`activate:${id}`, { title: `Activate "${o.name}"`, detail: 'Verify promotional permissions and tracking link, then send the activation signal.', module: 'approvals', ref: `offer:${id}`, priority: 'High', role: 'approver' });
  if (to === 'Active') await tasks.done(`activate:${id}`);
  return updated;
}

/** Discovery: pull programme lists from every configured network, keep relevant ones. */
async function discover() {
  const summary = {};
  for (const net of networks.all) {
    if (!net.configured()) { summary[net.name] = 'not configured'; continue; }
    let found = [];
    try {
      if (net === networks.awin) for (const cc of config.automation.discoveryCountries) { found.push(...await net.programmes({ countryCode: cc, relationship: 'notjoined' })); found.push(...await net.programmes({ countryCode: cc, relationship: 'joined' })); }
      else found = await net.programmes();
    } catch (e) { summary[net.name] = `error: ${e.message}`; log.warn({ err: e.message, net: net.name }, 'discovery failed'); continue; }
    let added = 0, joinedSignals = 0;
    for (const p of found) {
      if (!RELEVANT.test(`${p.name} ${p.category} ${p.advertiser}`)) continue;
      const existing = await offers.byExtKey(p.extKey);
      if (!existing) {
        await offers.insert({ extKey: p.extKey, status: 'Discovered', name: p.name, network: p.network, advertiser: p.advertiser, category: p.category, markets: p.markets, commission: p.commission, metric: p.metric || '', url: p.url, vertical: PET.test(`${p.name} ${p.category}`) ? 'Pet' : 'Nutra', source: 'auto-discovery', networkData: p.raw });
        added++;
      } else {
        await offers.update(existing.id, { networkData: p.raw, url: p.url || existing.url });
        // The network says we're joined → signal to a human; never auto-activate.
        if (p.joined && ['Approval pending', 'Shortlisted'].includes(existing.status)) {
          joinedSignals++;
          await tasks.add(`joined:${existing.id}`, { title: `${p.network} shows MWC joined "${existing.name}"`, detail: 'Verify the approval and move the offer to Approved, then activate.', module: 'approvals', ref: `offer:${existing.id}`, priority: 'High', role: 'approver' });
        }
      }
    }
    summary[net.name] = { fetched: found.length, added, joinedSignals };
  }
  return summary;
}

/** Imports a marketplace export (e.g. ClickBank CSV) or a hand-built list. */
async function importFeed(rows, network) {
  let added = 0;
  for (const r of rows) {
    const extKey = `${network.toLowerCase()}:${r.id || r.sku || r.name}`;
    if (await offers.byExtKey(extKey)) continue;
    if (!RELEVANT.test(`${r.name} ${r.category || ''}`)) continue;
    await offers.insert({ extKey, status: 'Discovered', name: r.name, network, category: r.category || '', commission: r.commission || '', metric: r.gravity ? `gravity ${r.gravity}` : (r.metric || ''), url: r.url || '', markets: r.markets || 'All', vertical: PET.test(`${r.name} ${r.category}`) ? 'Pet' : 'Nutra', source: 'feed-import' });
    added++;
  }
  return { added };
}

/** Demand context the AI uses: what customers, research and search say they need. */
async function demandContext() {
  const [research, insights, contacts, chats] = await Promise.all([repo('research').list({ limit: 40 }), repo('insights').list({ limit: 40 }), repo('contacts').list({ limit: 500 }), repo('chats').list({ limit: 100 })]);
  const interests = {}; contacts.forEach(c => (c.interests || []).forEach(i => { interests[i] = (interests[i] || 0) + 1; }));
  const needs = {}; chats.forEach(c => (c.needs || []).concat(c.unmetNeeds || []).forEach(n => { needs[n] = (needs[n] || 0) + 1; }));
  return {
    research: research.map(r => ({ title: r.title, category: r.category, vertical: r.vertical, market: r.market, finding: String(r.finding || '').slice(0, 300) })),
    customerInterests: interests, chatbotNeeds: needs,
    openInsights: insights.filter(i => i.status !== 'Dismissed').map(i => i.text).slice(0, 25),
  };
}

/** AI evaluation of one offer (any status). Stores score + reasoning; never changes status itself. */
async function evaluate(id, ctx) {
  const o = await offers.get(id);
  if (!o) throw Object.assign(new Error('Offer not found'), { status: 404 });
  ctx = ctx || await demandContext();
  const ev = await ai.json('offer.score', `Evaluate this affiliate offer for MWC against market demand and customer data. Offer selection must be driven by customer demand, not by availability on a network.
Score 0-100: demand fit and customer need matter most, then verifiable reputation, programme terms, permitted traffic sources, promotional material and content opportunity. Penalise unverifiable claims and missing information.
Reply with JSON {"score":number,"demandFit":string,"customerNeed":string,"reputation":string,"terms":string,"trafficFit":string,"contentOpportunities":string,"risks":string,"missingInfo":string,"recommendation":"Shortlist"|"Needs more research"|"Reject"}.
Offer: ${JSON.stringify({ name: o.name, network: o.network, advertiser: o.advertiser, vertical: o.vertical, category: o.category, markets: o.markets, commission: o.commission, url: o.url, demandEvidence: o.demandEvidence, notes: o.notes })}
MWC demand context: ${JSON.stringify(ctx).slice(0, 12000)}`, { context: o });
  const score = Math.max(0, Math.min(100, Math.round(Number(ev.score) || 0)));
  return offers.update(id, { score, evaluation: ev, aiRecommendation: score < config.automation.rejectScore ? 'Reject' : ev.recommendation, evaluatedAt: new Date().toISOString() });
}

/** Daily: evaluate new offers. Automation moves only Discovered → Under evaluation → Shortlisted. */
async function scoreNew(limit = 20) {
  const pending = await offers.list({ status: 'Discovered', limit });
  const ctx = await demandContext();
  const out = { scored: 0, shortlisted: 0 };
  const sys = { name: 'automation', system: true };
  for (const o of pending) {
    const e = await evaluate(o.id, ctx);
    await transition(o.id, 'Under evaluation', sys, { score: e.score });
    out.scored++;
    if (e.score >= config.automation.shortlistScore && e.evaluation.recommendation !== 'Reject' && !(await networkBlocked(o.network))) { await transition(o.id, 'Shortlisted', sys, { score: e.score }); out.shortlisted++; }
  }
  return out;
}

/** Network performance → metrics (commissions, clicks) per offer. */
async function performance() {
  const metrics = repo('metrics'); const res = {}; const day = new Date().toISOString().slice(0, 10);
  if (networks.awin.configured()) {
    try {
      const tx = await networks.awin.transactions(7); const by = {};
      for (const t of tx || []) { const k = `awin:${t.advertiserId}`; by[k] = by[k] || { conversions: 0, commission: 0 }; by[k].conversions++; by[k].commission += Number(t.commissionAmount?.amount || 0); }
      for (const [k, v] of Object.entries(by)) await metrics.upsertByExtKey(`perf:${k}:${day}`, { date: day, source: 'Affiliate network', page: k, offerExtKey: k, conversions: v.conversions, revenue: Math.round(v.commission * 100) / 100 });
      res.awin = Object.keys(by).length;
    } catch (e) { res.awin = `error: ${e.message}`; }
  }
  if (networks.impact.configured()) {
    try {
      const r = await networks.impact.actions(7); const by = {};
      for (const a of r?.Actions || []) { const k = `impact:${a.CampaignId}`; by[k] = by[k] || { conversions: 0, commission: 0 }; by[k].conversions++; by[k].commission += Number(a.Payout || 0); }
      for (const [k, v] of Object.entries(by)) await metrics.upsertByExtKey(`perf:${k}:${day}`, { date: day, source: 'Affiliate network', page: k, offerExtKey: k, conversions: v.conversions, revenue: Math.round(v.commission * 100) / 100 });
      res.impact = Object.keys(by).length;
    } catch (e) { res.impact = `error: ${e.message}`; }
  }
  if (networks.clickbank.configured()) {
    try { const r = await networks.clickbank.analytics(7); if (r) await metrics.upsertByExtKey(`perf:clickbank:${day}`, { date: day, source: 'Affiliate network', page: 'clickbank', raw: r }); res.clickbank = r ? 'ok' : 'feed only'; } catch (e) { res.clickbank = `error: ${e.message}`; }
  }
  return res;
}

module.exports = { STATUSES, NEXT, transition, discover, importFeed, evaluate, scoreNew, performance, demandContext, networkBlocked, isPromotable: (o) => !!o && PROMOTABLE.has(o.status) };
