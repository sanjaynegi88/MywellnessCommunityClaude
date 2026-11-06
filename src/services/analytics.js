// Section 7: analytics consolidation — GA4, Search Console, affiliate networks, social, email, chatbot, CRM.
const { repo } = require('../db');
const { ga4, searchConsole } = require('../connectors/google');

const metrics = repo('metrics');

async function pull() {
  const out = {}; const day = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (ga4.configured()) {
    try {
      const pages = await ga4.pageReport(1);
      for (const r of pages) await metrics.upsertByExtKey(`ga4:${day}:${r.page}:${r.channel}`, { date: day, source: 'GA4', page: r.page, channel: r.channel, sessions: r.sessions, engaged: r.engaged, conversions: r.conversions });
      const clicks = await ga4.eventReport('affiliate_click', 1);
      for (const r of clicks) await metrics.upsertByExtKey(`ga4click:${day}:${r.page}`, { date: day, source: 'GA4', page: r.page, clicks: r.clicks, metric: 'affiliate_click' });
      out.ga4 = { pages: pages.length, clickPages: clicks.length };
    } catch (e) { out.ga4 = `error: ${e.message}`; }
  } else out.ga4 = 'not configured';
  if (searchConsole.configured()) {
    try {
      const rows = await searchConsole.queries(7, ['query', 'page']);
      for (const r of rows.slice(0, 1000)) await metrics.upsertByExtKey(`gsc:${day}:${r.page}:${r.query}`, { date: day, source: 'Search Console', page: r.page, query: r.query, sessions: r.impressions, impressions: r.impressions, clicks: r.clicks, position: Math.round(r.position * 10) / 10 });
      out.searchConsole = rows.length;
      // content opportunities: high impressions, low CTR
      for (const r of rows.filter(r => r.impressions > 200 && r.ctr < 0.01).slice(0, 5)) await repo('insights').insert({ text: `"${r.query}" gets ${r.impressions} impressions but ${(r.ctr * 100).toFixed(1)}% CTR`, why: `Page ${r.page}, position ${r.position.toFixed(1)}: improve title/meta or create a dedicated page`, kind: 'Recommendation', module: 'content', priority: 'Medium', source: 'Search Console', status: 'Open' });
    } catch (e) { out.searchConsole = `error: ${e.message}`; }
  } else out.searchConsole = 'not configured';
  return out;
}

/** The central performance dashboard (answers the questions in section 7). */
async function dashboard(days = 30) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const rows = (await metrics.list({ limit: 20000 })).filter(m => (m.date || '') >= since);
  const sumBy = (filter, key) => { const o = {}; rows.filter(filter).forEach(m => { const k = m[key] || '(none)'; o[k] = o[k] || { sessions: 0, clicks: 0, conversions: 0, revenue: 0 }; o[k].sessions += +m.sessions || 0; o[k].clicks += +m.clicks || 0; o[k].conversions += +m.conversions || 0; o[k].revenue += +m.revenue || 0; }); return Object.entries(o).sort((a, b) => b[1].sessions - a[1].sessions).slice(0, 25); };
  const content = await repo('content').list({ limit: 2000 });
  const byType = {}; content.filter(c => c.wpUrl).forEach(c => { let p; try { p = new URL(c.wpUrl).pathname; } catch (_) { p = c.wpUrl; } const s = rows.filter(m => m.source === 'GA4' && m.page === p).reduce((a, m) => a + (+m.sessions || 0), 0); byType[c.type] = (byType[c.type] || 0) + s; });
  const contacts = await repo('contacts').list({ limit: 100000 });
  const segs = {}; contacts.forEach(c => (c.segments || []).forEach(s => { segs[s] = (segs[s] || 0) + 1; }));
  const campaigns = await repo('campaigns').list({ limit: 500 });
  return {
    topPages: sumBy(m => m.source === 'GA4', 'page'),
    bySource: sumBy(() => true, 'source'),
    affiliateRevenue: sumBy(m => m.source === 'Affiliate network', 'page'),
    contentTypeSessions: byType,
    socialToSite: (await repo('social').list({ status: 'Posted', limit: 1000 })).reduce((a, p) => a + (+p.clicks || 0), 0),
    email: campaigns.map(c => ({ name: c.name, segment: c.segment, sent: c.sent, openRate: c.sent ? c.opens / c.sent : null, clickRate: c.sent ? c.clicks / c.sent : null })),
    segments: segs,
    chatSessions: await repo('chats').count(),
  };
}

module.exports = { pull, dashboard };
