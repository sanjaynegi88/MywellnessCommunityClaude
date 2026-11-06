// Polite competitor website crawler: obeys robots.txt, identifies itself, fetches a handful
// of pages, and extracts STRUCTURE and FEATURES only (navigation, headings, page types, conversion
// elements). It never stores competitors' body copy or images — functional analysis only.
const cheerio = require('cheerio');
const { request } = require('../lib/http');
const UA = 'MWC360-Research/1.0 (+https://mywellnesscommunity.com)';

async function allowed(origin, path = '/') {
  try {
    const txt = await request(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, raw: true, retries: 0, timeoutMs: 10000 });
    let applies = false; const dis = [];
    for (const line of String(txt).split(/\r?\n/)) {
      const [k, ...rest] = line.split(':'); const v = rest.join(':').trim();
      if (/^user-agent$/i.test(k.trim())) applies = v === '*' || /mwc360/i.test(v);
      else if (applies && /^disallow$/i.test(k.trim()) && v) dis.push(v);
    }
    return !dis.some(d => path.startsWith(d));
  } catch (_) { return true; } // no robots.txt → allowed
}

const FEATURE_TESTS = [
  ['Need-based navigation', ($, t) => /shop by (need|concern|goal)|by health (goal|need)|sleep|joint|digest/i.test($('nav').text())],
  ['Comparison tables', ($, t) => $('table').length > 0 && /\bvs\.?\b|compar/i.test(t)],
  ['Buying guides', (_, t) => /buying guide|how to choose/i.test(t)],
  ['Quiz / product finder', (_, t) => /\bquiz\b|product finder|find your/i.test(t)],
  ['Lead magnet', (_, t) => /free (guide|ebook|checklist|download)/i.test(t)],
  ['Email popup', ($, t) => /newsletter|subscribe/i.test(t) && $('input[type=email]').length > 0],
  ['Detailed reviews', (_, t) => /\breview(s|ed)?\b/i.test(t)],
  ['Star ratings', ($) => $('[itemprop=ratingValue], .star-rating, .stars').length > 0],
  ['Expert reviewer bios', (_, t) => /reviewed by|medically reviewed|vet reviewed|written by/i.test(t)],
  ['Deals page', (_, t) => /\bdeals?\b|coupon|discount code/i.test(t)],
  ['Chatbot', ($, t) => /intercom|drift|tidio|chat widget|livechat/i.test($('script').map((i, s) => $(s).attr('src') || '').get().join(' ') + t)],
  ['Video content', ($) => $('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length > 0],
  ['Product grids', ($) => $('[class*=product] [class*=grid], [class*=products], .product-grid').length > 0],
];

async function analyse(url, { maxPages = 6 } = {}) {
  const origin = new URL(url).origin;
  if (!(await allowed(origin, '/'))) return { origin, blocked: true, reason: 'robots.txt disallows crawling' };
  const html = await request(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, raw: true, timeoutMs: 20000 });
  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ');
  const nav = [...new Set($('nav a, header a').map((i, a) => $(a).text().trim()).get().filter(s => s && s.length < 40))].slice(0, 60);
  const headings = $('h1, h2').map((i, h) => $(h).text().trim()).get().filter(Boolean).slice(0, 40);
  const schemaTypes = [...new Set($('script[type="application/ld+json"]').map((i, s) => { try { const j = JSON.parse($(s).text()); return [].concat(j).map(x => x['@type']).flat(); } catch (_) { return []; } }).get())];
  const features = new Set(FEATURE_TESTS.filter(([, f]) => { try { return f($, text); } catch (_) { return false; } }).map(([n]) => n));

  // sample a few internal pages to classify page types
  const links = [...new Set($('a[href]').map((i, a) => { try { return new URL($(a).attr('href'), origin).href.split('#')[0]; } catch (_) { return null; } }).get())]
    .filter(h => h && h.startsWith(origin) && !/\.(jpg|png|pdf|zip)$/i.test(h)).slice(0, 80);
  const pageTypes = {};
  for (const l of links) { const p = new URL(l).pathname.toLowerCase(); const k = /review/.test(p) ? 'review' : /\bvs\b|compar|best-/.test(p) ? 'comparison/best-of' : /guide/.test(p) ? 'guide' : /blog|article|news/.test(p) ? 'blog' : /categor|collections|shop/.test(p) ? 'category' : null; if (k) pageTypes[k] = (pageTypes[k] || 0) + 1; }
  for (const l of links.filter(l => /review|best-|guide/.test(l)).slice(0, maxPages - 1)) {
    if (!(await allowed(origin, new URL(l).pathname))) continue;
    try { const h2 = await request(l, { headers: { 'User-Agent': UA, Accept: 'text/html' }, raw: true, retries: 0, timeoutMs: 15000 }); const $2 = cheerio.load(h2); const t2 = $2('body').text(); FEATURE_TESTS.forEach(([n, f]) => { try { if (f($2, t2)) features.add(n); } catch (_) {} }); } catch (_) { /* skip page */ }
  }
  return { origin, nav, headings, schemaTypes, pageTypes, features: [...features], crawledAt: new Date().toISOString() };
}

module.exports = { analyse, allowed };
