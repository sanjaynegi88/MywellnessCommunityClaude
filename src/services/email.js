// Section 6: email marketing. MWC owns contacts, consent, segments and strategy;
// MailerLite executes delivery. Engagement flows back via webhooks and stats polling.
const { repo, db, now } = require('../db');
const ai = require('../lib/ai');
const ml = require('../connectors/mailerlite');
const crm = require('./crm');
const tasks = require('./tasks');
const { audit } = require('../lib/audit');
const { emailGroupsOf, isEmailable } = require('../lib/segments');

const contacts = repo('contacts');
const campaigns = repo('campaigns');

/** Hourly: push consented contacts (with segment groups) and propagate suppressions. */
async function sync() {
  if (!ml.configured()) return { skipped: 'MailerLite not configured' };
  const out = { synced: 0, unsubscribed: 0, errors: 0 };
  for (const c of await contacts.list({ limit: 100000 })) {
    try {
      const suppressed = c.suppressed || await crm.isSuppressed(c.email);
      if (suppressed) { if (c.mlSyncedAt && !c.mlUnsubscribedAt) { await ml.unsubscribe(c.email); await contacts.update(c.id, { mlUnsubscribedAt: now() }); out.unsubscribed++; } continue; }
      if (!isEmailable(c)) continue;
      if (c.mlSyncedAt && c.mlSyncedAt >= c.updatedAt) continue;
      await ml.upsertSubscriber({ email: c.email, name: c.name, country: c.country, vertical: c.vertical, groups: emailGroupsOf(c) });
      await contacts.update(c.id, { mlSyncedAt: new Date(Date.now() + 1000).toISOString() });
      out.synced++;
    } catch (e) { out.errors++; }
  }
  return out;
}

/** AI drafts a campaign for a segment. Always lands as Draft for human approval. */
async function draft({ segment, type = 'Newsletter', name }) {
  const members = (await contacts.list({ limit: 100000 })).filter(c => isEmailable(c) && (!segment || (c.segments || []).includes(segment)));
  const interests = {}; members.forEach(m => (m.interests || []).forEach(i => { interests[i] = (interests[i] || 0) + 1; }));
  const pages = (await repo('content').list({ status: 'Published', limit: 30 })).map(p => `${p.title} ${p.wpUrl || ''}`);
  const offers = (await repo('offers').list({ status: 'Active', limit: 50 })).map(o => `${o.name} (${o.category})`);
  const e = await ai.json('email.draft', `Write a ${type} email for MWC subscribers in segment "${segment || 'All emailable'}" (${members.length} consented; top interests ${JSON.stringify(interests)}).
Link only to these verified pages: ${pages.join('; ') || 'none yet — keep it educational'}
Offers you may mention (ACTIVE only): ${offers.join('; ') || 'none'}
Reply JSON {"subject": string, "preview": string, "html": string (simple HTML, merge field {$name}, one clear CTA, affiliate disclosure if an offer is mentioned, footer line "You receive this because you subscribed at mywellnesscommunity.com. Unsubscribe: {$unsubscribe}")}.`, { context: { segment } });
  let html = String(e.html || '');
  if (!/\{\$unsubscribe\}/.test(html)) html += '\n<p style="font-size:12px;color:#666">You receive this because you subscribed at mywellnesscommunity.com. <a href="{$unsubscribe}">Unsubscribe</a></p>';
  const doc = await campaigns.insert({ name: name || `${type} — ${segment || 'All emailable'} — ${now().slice(0, 10)}`, type, segment: segment || '', subject: e.subject, preview: e.preview, body: html, status: 'Draft', audience: members.length });
  await tasks.add(`campaign:${doc.id}`, { title: `Approve email "${doc.name}"`, detail: `${members.length} recipients.`, module: 'email', ref: `campaign:${doc.id}`, role: 'approver' });
  return doc;
}

async function approveAndSend(id, user) {
  if (!['approver', 'admin'].includes(user.role)) throw Object.assign(new Error('Only an approver can send campaigns'), { status: 403 });
  const c = await campaigns.get(id); if (!c) throw Object.assign(new Error('Campaign not found'), { status: 404 });
  if (!/\{\$unsubscribe\}|unsubscribe/i.test(c.body || '')) throw Object.assign(new Error('Email must contain an unsubscribe link'), { status: 400 });
  if (!ml.configured()) { await campaigns.update(id, { status: 'Approved' }); return campaigns.get(id); }
  await sync();
  const groupId = await ml.ensureGroup(c.segment || 'Nutra wellness');
  const r = await ml.createCampaign({ name: c.name, subject: c.subject, from: process.env.EMAIL_FROM || 'hello@mywellnesscommunity.com', html: c.body, groupIds: [groupId] });
  await ml.scheduleNow(r.data.id);
  await audit(user, 'campaign sent', `campaign:${id}`, { mlId: r.data.id });
  await tasks.done(`campaign:${id}`);
  return campaigns.update(id, { status: 'Sending', mlId: r.data.id, approvedBy: user.name, sentAt: now() });
}

/** Daily: campaign stats back from MailerLite. */
async function stats() {
  if (!ml.configured()) return { skipped: 'MailerLite not configured' };
  let n = 0;
  for (const c of (await campaigns.list({ status: ['Sending', 'Sent'], limit: 200 })).filter(c => c.mlId)) {
    const r = await ml.campaign(c.mlId); const s = r?.data?.stats || {};
    await campaigns.update(c.id, { status: r?.data?.status === 'sent' ? 'Sent' : c.status, sent: s.sent ?? c.sent, opens: s.opens_count ?? c.opens, clicks: s.clicks_count ?? c.clicks, unsubs: s.unsubscribes_count ?? c.unsubs });
    await repo('metrics').upsertByExtKey(`email:${c.id}`, { date: now().slice(0, 10), source: 'Email', page: c.name, sessions: s.sent || 0, clicks: s.clicks_count || 0, engaged: s.opens_count || 0 });
    n++;
  }
  return { updated: n };
}

/** MailerLite webhook events → consent, suppression and engagement in the MWC database. */
async function handleWebhook(body) {
  const events = Array.isArray(body?.events) ? body.events : [body];
  let handled = 0;
  for (const ev of events) {
    const type = ev.type || ev.event || '';
    const email = ev.data?.subscriber?.email || ev.subscriber?.email || ev.data?.email || ev.email;
    await db()('webhook_events').insert({ source: 'mailerlite', type, payload: JSON.stringify(ev).slice(0, 20000), received_at: now(), processed: true });
    if (!email) continue;
    if (/unsubscribed|bounced|spam_reported/.test(type)) { await crm.withdrawConsent(email, type, 'MailerLite webhook'); handled++; continue; }
    const c = await contacts.byExtKey(`email:${crm.normEmail(email)}`);
    if (!c) continue;
    if (/open/.test(type)) await crm.logInteraction(c.id, 'Email open', ev.data?.campaign?.name || 'Campaign open');
    else if (/click/.test(type)) await crm.logInteraction(c.id, 'Email click', ev.data?.link?.url || ev.data?.url || 'Link click');
    handled++;
  }
  return { handled };
}

module.exports = { sync, draft, approveAndSend, stats, handleWebhook };
