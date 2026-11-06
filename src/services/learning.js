// Section 8: continuous learning. Connects findings across modules and ACTS on the safe ones:
// creates content ideas (which the content autopilot drafts), queues offer searches,
// flags pages for refresh and drafts segment campaigns. Anything else becomes a human task.
const { repo, now } = require('../db');
const ai = require('../lib/ai');
const tasks = require('./tasks');
const { segmentsOf } = require('../lib/segments');

async function snapshot() {
  const pick = async (t, fields, limit = 15) => (await repo(t).list({ limit })).map(o => Object.fromEntries(fields.map(f => [f, o[f]])));
  const contacts = await repo('contacts').list({ limit: 5000 });
  const count = (arr, fn) => arr.reduce((m, x) => { [].concat(fn(x) || []).forEach(k => { m[k] = (m[k] || 0) + 1; }); return m; }, {});
  return {
    research: await pick('research', ['title', 'category', 'vertical', 'market', 'confidence']),
    ads: await pick('ads', ['brand', 'format', 'hook', 'trigger', 'runningDays']),
    competitors: await pick('competitors', ['name', 'features', 'gaps']),
    offers: await pick('offers', ['name', 'network', 'vertical', 'category', 'status', 'score'], 40),
    content: await pick('content', ['title', 'type', 'vertical', 'status', 'optimisationReason'], 40),
    social: await pick('social', ['platform', 'status', 'reach', 'clicks']),
    customerInterests: count(contacts, c => c.interests || []),
    segments: count(contacts, segmentsOf),
    campaigns: await pick('campaigns', ['name', 'segment', 'sent', 'opens', 'clicks', 'unsubs']),
    chats: await pick('chats', ['summary', 'needs', 'unmetNeeds', 'questions', 'country'], 30),
    metrics: await pick('metrics', ['source', 'page', 'sessions', 'clicks', 'conversions'], 40),
    openInsights: (await repo('insights').list({ status: 'Open', limit: 30 })).map(i => i.text),
  };
}

const ACTIONS = {
  async 'content.idea'(a) {
    const exists = (await repo('content').list({ limit: 3000 })).some(c => c.title.toLowerCase() === String(a.title || '').toLowerCase());
    if (exists || !a.title) return 'exists';
    await repo('content').insert({ title: String(a.title), type: a.contentType || 'Educational blog', vertical: a.vertical || 'Both', keywords: a.keywords || '', status: 'Idea', source: 'learning-cycle' });
    return 'content idea created';
  },
  async 'discovery.keyword'(a) {
    if (!a.keyword) return 'skipped';
    await repo('research').upsertByExtKey(`discovery:${a.keyword}`, { title: `Offer search: ${a.keyword}`, category: 'Emerging products', vertical: a.vertical || 'Both', market: 'All', confidence: 'Medium', finding: 'Queued by the learning engine for offer discovery.', auto: true });
    await tasks.add(`search:${a.keyword}`, { title: `Search networks for "${a.keyword}" offers`, detail: 'Customer demand detected without a matching offer.', module: 'offers' });
    return 'offer search queued';
  },
  async 'content.update'(a) {
    const c = (await repo('content').list({ status: 'Published', limit: 2000 })).find(x => x.title.toLowerCase() === String(a.title || '').toLowerCase());
    if (!c) return 'not found';
    await repo('content').update(c.id, { status: 'Needs update', optimisationReason: a.reason || 'Learning engine' });
    return 'content flagged';
  },
  async 'email.campaign'(a) {
    await require('./email').draft({ segment: a.segment, type: a.campaignType || 'Segmented campaign' });
    return 'campaign drafted';
  },
};

async function cycle() {
  const snap = await snapshot();
  const recs = await ai.json('learning.cycle', `You are the continuous-learning engine of MWC's 360° system. Connect findings ACROSS modules (chatbot needs → missing offers; approved offer → needed pages; ad patterns → landing pages; email engagement → interests; analytics → restructuring; competitor moves → opportunities).
Reply JSON array (6–10) of {"text": action, "why": evidence across modules, "kind": "Recommendation"|"Need"|"Trend"|"Risk", "module": "research"|"ads"|"competitors"|"offers"|"approvals"|"content"|"social"|"chatbot"|"crm"|"segments"|"email"|"analytics", "priority":"High"|"Medium"|"Low",
 "action": optional one of {"type":"content.idea","title","contentType","vertical","keywords"} | {"type":"discovery.keyword","keyword","vertical"} | {"type":"content.update","title","reason"} | {"type":"email.campaign","segment","campaignType"}}.
Never suggest activating offers or publishing — those are human decisions.
${JSON.stringify(snap).slice(0, 60000)}`, { context: snap });
  const out = { recommendations: 0, actions: {} };
  for (const r of Array.isArray(recs) ? recs : []) {
    let result = '';
    if (r.action && ACTIONS[r.action.type]) { try { result = await ACTIONS[r.action.type](r.action); } catch (e) { result = `failed: ${e.message}`; } out.actions[r.action.type] = (out.actions[r.action.type] || 0) + 1; }
    await repo('insights').insert({ text: String(r.text || ''), why: String(r.why || ''), kind: r.kind || 'Recommendation', module: r.module || '', priority: r.priority || 'Medium', source: 'Learning cycle', status: result && !/failed|not found|skipped|exists/.test(result) ? 'Actioned' : 'Open', autoAction: result || undefined, at: now() });
    out.recommendations++;
  }
  return out;
}

module.exports = { snapshot, cycle, ACTIONS };
