// Stages 1–3: secondary market research, advertising intelligence, competitor website intelligence.
const { repo, now } = require('../db');
const ai = require('../lib/ai');
const config = require('../config');
const { adLibrary } = require('../connectors/social');
const tiktok = require('../connectors/tiktok');
const crawler = require('../connectors/crawler');
const { searchConsole } = require('../connectors/google');
const tasks = require('./tasks');

const research = repo('research'), ads = repo('ads'), competitors = repo('competitors'), insights = repo('insights');

/* ---------- Research ---------- */
/** Weekly: own search data + aggregated chatbot needs become research findings; AI synthesises. */
async function refreshResearch() {
  const out = { searchFindings: 0, customerFindings: 0, insights: 0 };
  if (searchConsole.configured()) {
    const rows = await searchConsole.queries(28, ['query']);
    for (const r of rows.sort((a, b) => b.impressions - a.impressions).slice(0, 40)) {
      await research.upsertByExtKey(`gsc:${r.query}`, { title: `Search demand: "${r.query}"`, category: 'Search & keywords', vertical: /dog|cat|pet|puppy|kitten/i.test(r.query) ? 'Pet' : 'Nutra', market: 'All', confidence: 'High', finding: `${r.impressions} impressions, ${r.clicks} clicks, CTR ${(r.ctr * 100).toFixed(1)}%, avg position ${r.position.toFixed(1)} (last 28 days, Search Console).`, source: 'Google Search Console', auto: true });
      out.searchFindings++;
    }
  }
  const chats = await repo('chats').list({ status: 'Processed', limit: 500 });
  const needs = {}; chats.forEach(c => (c.needs || []).concat(c.unmetNeeds || []).forEach(n => { const k = String(n).toLowerCase(); needs[k] = needs[k] || { n: 0, v: c.vertical, markets: new Set() }; needs[k].n++; if (c.country) needs[k].markets.add(c.country); }));
  for (const [k, v] of Object.entries(needs).filter(([, v]) => v.n >= 2)) {
    await research.upsertByExtKey(`chatneed:${k}`, { title: `Customer need: ${k}`, category: 'Customer needs', vertical: v.v || 'Both', market: [...v.markets].join(', ') || 'All', confidence: v.n >= 5 ? 'High' : 'Medium', finding: `Raised in ${v.n} chatbot conversations (primary research).`, source: 'MWC chatbot', auto: true });
    out.customerFindings++;
  }
  const recent = await research.list({ limit: 80 });
  const recs = await ai.json('research.synthesise', `Synthesise MWC's market research into the most important opportunities and gaps. Reply JSON array (max 8) of {"text": opportunity or gap, "kind":"Trend"|"Need"|"Gap", "priority":"High"|"Medium"|"Low", "module":"offers"|"content"|"research"|"ads"}.\n${JSON.stringify(recent.map(r => ({ title: r.title, category: r.category, vertical: r.vertical, market: r.market, finding: String(r.finding || '').slice(0, 300), confidence: r.confidence })))}`);
  for (const r of Array.isArray(recs) ? recs : []) { await insights.insert({ text: String(r.text), kind: r.kind || 'Trend', priority: r.priority || 'Medium', module: r.module || 'research', source: 'Research synthesis', status: 'Open' }); out.insights++; }
  return out;
}

/* ---------- Advertising intelligence ---------- */
async function storeAd(a, term) {
  const cur = await ads.byExtKey(a.extKey);
  const runningDays = a.startedAt ? Math.round((Date.now() - Date.parse(a.startedAt)) / 864e5) : null;
  if (cur) { await ads.update(cur.id, { runningDays, lastSeen: now() }); return false; }
  await ads.insert({ ...a, status: 'New', keyword: term, runningDays, perf: runningDays ? `Running ${runningDays} days` : '', lastSeen: now() });
  return true;
}

/** Daily: Meta Ad Library + TikTok Commercial Content API → ads → AI classification. */
async function ingestAds() {
  const out = { meta: 'not configured', tiktok: 'not configured', added: 0, classified: 0 };
  if (adLibrary.configured()) {
    let n = 0;
    try { for (const term of config.automation.adKeywords) for (const a of await adLibrary.search(term, config.automation.adCountries)) if (await storeAd(a, term)) n++; out.meta = n; }
    catch (e) { out.meta = `error: ${e.message}`; }
    out.added += n;
  }
  if (tiktok.adLibrary.configured()) {
    let n = 0;
    try { for (const term of config.automation.adKeywords) for (const cc of config.automation.tiktokAdCountries) for (const a of await tiktok.adLibrary.search(term, cc)) if (await storeAd(a, term)) n++; out.tiktok = n; }
    catch (e) { out.tiktok = `error: ${e.message}`; }
    out.added += n;
  }
  out.classified = (await classifyAds()).classified;
  return out;
}

/** Import ads from sources without an API (Google Ads Transparency Center, YouTube, manual research).
 *  rows: [{advertiser, platform, format, text|hook, url, firstShown, duration}] */
async function importAds(rows, source = 'Import') {
  let added = 0;
  for (const r of rows.slice(0, 2000)) {
    const brand = String(r.advertiser || r.brand || '').trim(); if (!brand) continue;
    const key = `import:${String(r.url || '') || brand + ':' + String(r.text || r.hook || '').slice(0, 60)}`;
    const ok = await storeAd({ extKey: key, brand, platform: r.platform || 'Google / YouTube', format: r.format || '', text: String(r.text || r.hook || '').slice(0, 2000), hook: r.hook || '', duration: Number(r.duration) || null, startedAt: r.firstShown || r.startedAt || null, source: r.url || '', importedFrom: source }, r.keyword || '');
    if (ok) added++;
  }
  const c = await classifyAds(100);
  return { added, classified: c.classified };
}
async function classifyAds(limit = 40) {
  let n = 0;
  for (const a of await ads.list({ status: 'New', limit })) {
    const x = await ai.json('ads.classify', `Classify this ad for MWC's creative intelligence. Reply JSON {"hook": opening line/idea, "pain": pain point, "trigger": "Fear/worry"|"Relief"|"Aspiration"|"Curiosity"|"Social proof"|"Urgency"|"Love for pet"|"Authority", "story": "Problem → solution"|"Before/after"|"Founder story"|"Expert explainer"|"Listicle"|"Testimonial style"|"Demo", "cta": string, "landing": "Product page"|"Advertorial"|"Quiz funnel"|"VSL"|"Comparison page"|"Lead magnet", "format": "Video"|"UGC video"|"Static image"|"Carousel"|"Story/Reel"|"Text/Search", "vertical": "Nutra"|"Pet"}.\nAdvertiser: ${a.brand}\nPlacements: ${(a.placements || []).join(', ')}\nText:\n${a.text || a.hook || '(no text; ' + (a.media?.videos?.length ? 'video ad' : 'image ad') + ')'}`, { tier: 'quick' });
    await ads.update(a.id, { ...x, status: 'Classified' }); n++;
  }
  return { classified: n };
}
/** Weekly: winning patterns → original MWC creative briefs (stored as creatives) + insights. */
async function adPatterns() {
  const list = await ads.list({ status: 'Classified', limit: 300 });
  if (!list.length) return { skipped: 'no classified ads' };
  const long = list.filter(a => (a.runningDays || 0) >= 30); // long-running ads are a proxy for success
  const text = await ai.complete('ads.patterns', `From these competitor ads (long-running ones are likely successful), identify: winning hooks, formats and durations by platform, recurring pains/triggers, landing journeys. Then write THREE original MWC creative briefs (platform, format, duration, hook, script/visual outline, CTA, landing page). Do not copy any brand's wording or assets. Cite advertiser names you draw from.\n${JSON.stringify((long.length ? long : list).slice(0, 80).map(a => ({ brand: a.brand, hook: a.hook, pain: a.pain, trigger: a.trigger, story: a.story, format: a.format, landing: a.landing, runningDays: a.runningDays, source: a.source })))}`);
  await repo('creatives').insert({ kind: 'Creative brief', status: 'Ready', title: `Ad-pattern briefs ${now().slice(0, 10)}`, body: text, source: 'Ad intelligence' });
  await insights.insert({ text: 'New creative briefs from ad patterns are ready', why: `${list.length} ads analysed (${long.length} long-running)`, kind: 'Recommendation', module: 'social', priority: 'Medium', source: 'Ad intelligence', status: 'Open' });
  return { analysed: list.length };
}

/* ---------- Competitor intelligence ---------- */
async function crawlCompetitors() {
  const out = { crawled: 0, blocked: 0, newFeatures: 0 };
  for (const c of (await competitors.list({ limit: 100 })).filter(c => c.url)) {
    try {
      const snap = await crawler.analyse(c.url);
      if (snap.blocked) { await competitors.update(c.id, { lastCrawl: snap }); out.blocked++; continue; }
      const before = new Set(c.features || []); const added = snap.features.filter(f => !before.has(f));
      const rec = await ai.json('competitor.analyse', `Analyse this competitor's STRUCTURE (not copy) for MWC. Reply JSON {"features": [..], "gaps": content gaps MWC can fill, "recommendations": [{"title","effort":"S"|"M"|"L","why"}]}. Functional adaptation only — never copy text, images, branding or code.\n${JSON.stringify({ name: c.name, nav: snap.nav, headings: snap.headings, pageTypes: snap.pageTypes, detected: snap.features, schemaTypes: snap.schemaTypes })}`);
      await competitors.update(c.id, { features: [...new Set([...(c.features || []), ...snap.features, ...(rec.features || [])])], gaps: rec.gaps || c.gaps, recommendations: rec.recommendations || [], lastCrawl: snap, crawledAt: now() });
      for (const f of added) { await insights.insert({ text: `${c.name} added: ${f}`, kind: 'Trend', module: 'competitors', priority: 'Low', source: 'Competitor crawl', status: 'Open' }); out.newFeatures++; }
      for (const r of (rec.recommendations || []).slice(0, 3)) await tasks.add(`siteimp:${String(r.title).toLowerCase().slice(0, 80)}`, { title: `Website improvement: ${r.title}`, detail: `${r.why || ''} (effort ${r.effort || '?'}, seen on ${c.name})`, module: 'content', priority: r.effort === 'S' ? 'Medium' : 'Low' });
      out.crawled++;
    } catch (e) { await competitors.update(c.id, { crawlError: e.message }); }
  }
  return out;
}

module.exports = { refreshResearch, ingestAds, importAds, classifyAds, adPatterns, crawlCompetitors };
