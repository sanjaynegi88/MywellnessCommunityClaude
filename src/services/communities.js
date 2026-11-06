// Social media audience & community research (brief section 3):
// finds relevant communities, channels and accounts through official APIs (Reddit, YouTube),
// scores relevance with AI, tracks size/activity over time and feeds findings into research.
// Facebook/Instagram groups have no public search API: those are added by the team in the console
// and then tracked and scored the same way.
const { repo, now } = require('../db');
const ai = require('../lib/ai');
const config = require('../config');
const reddit = require('../connectors/reddit');
const youtube = require('../connectors/youtube');

const communities = repo('communities');

async function discover() {
  const out = { found: 0, added: 0, updated: 0, sources: {} };
  const sources = [['Reddit', reddit.configured() ? (q) => reddit.communities(q) : null], ['YouTube', youtube.search.configured() ? (q) => youtube.search.channels(q) : null]];
  const fresh = [];
  for (const [name, fn] of sources) {
    if (!fn) { out.sources[name] = 'not configured'; continue; }
    let n = 0;
    for (const kw of config.automation.communityKeywords) {
      try { for (const c of await fn(kw)) { fresh.push({ ...c, keyword: kw }); n++; } } catch (e) { out.sources[name] = `error: ${e.message}`; break; }
    }
    if (!out.sources[name]) out.sources[name] = n;
  }
  const unique = [...new Map(fresh.map(c => [c.extKey, c])).values()];
  out.found = unique.length;
  if (!unique.length) return out;

  // AI relevance scoring in batches (audience fit for MWC's Nutra + Pet verticals)
  for (let i = 0; i < unique.length; i += 25) {
    const batch = unique.slice(i, i + 25);
    const scores = await ai.json('communities.rank', `Rate how relevant each online community is for MWC's audiences (human wellness/supplements and pet wellness/pet food; USA, UK, Europe). Consider topic fit, audience size and whether members discuss problems MWC content can help with. Exclude communities hostile to commercial content as "avoid".
Reply JSON array of {"key": the extKey, "relevance": 0-100, "vertical": "Nutra"|"Pet"|"Both", "audienceNeeds": short phrase, "approach": "listen"|"engage"|"avoid", "rules": short note on self-promotion rules if known or "check rules"}.
${JSON.stringify(batch.map(c => ({ key: c.extKey, platform: c.platform, name: c.name, description: c.description, audience: c.audience, keyword: c.keyword })))}`, { tier: 'quick' });
    const byKey = new Map((Array.isArray(scores) ? scores : []).map(s => [s.key, s]));
    for (const c of batch) {
      const s = byKey.get(c.extKey) || {};
      const cur = await communities.byExtKey(c.extKey);
      const history = [...(cur?.history || []), { at: now().slice(0, 10), audience: c.audience, activity: c.activity }].slice(-26);
      const growth = history.length > 1 && history[0].audience ? Math.round((c.audience - history[0].audience) / history[0].audience * 1000) / 10 : null;
      const doc = { ...c, relevance: Number(s.relevance) || 0, vertical: s.vertical || cur?.vertical || 'Both', audienceNeeds: s.audienceNeeds || '', approach: s.approach || 'listen', rules: s.rules || 'check rules', history, growthPct: growth, status: (Number(s.relevance) || 0) >= 60 ? 'Relevant' : 'Low relevance', lastSeen: now() };
      if (cur) { await communities.update(cur.id, doc); out.updated++; } else { await communities.insert(doc); out.added++; }
    }
  }
  // strongest new communities → research findings (feeds content, offers and learning)
  for (const c of (await communities.list({ status: 'Relevant', limit: 500 })).filter(c => c.audienceNeeds).sort((a, b) => b.relevance - a.relevance).slice(0, 10)) {
    await repo('research').upsertByExtKey(`community:${c.extKey}`, { title: `Community: ${c.name} (${c.platform})`, category: 'Social communities', vertical: c.vertical, market: 'All', confidence: c.audience > 50000 ? 'High' : 'Medium', finding: `${c.audience.toLocaleString()} members/subscribers. Audience needs: ${c.audienceNeeds}. Suggested approach: ${c.approach}. ${c.rules}.`, source: c.url, auto: true });
  }
  return out;
}

module.exports = { discover };
