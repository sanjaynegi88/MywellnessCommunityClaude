// Section 5: MWC's own AI-powered CRM — collection, central database, profiling,
// automatic segmentation, lead management, consent and suppression.
const crypto = require('crypto');
const { repo, db, now } = require('../db');
const ai = require('../lib/ai');
const config = require('../config');
const { audit } = require('../lib/audit');
const { segmentsOf, isEmailable } = require('../lib/segments');

const contacts = repo('contacts');
const interactions = repo('interactions');
const COUNTRY = (s) => { s = String(s || '').toLowerCase(); if (/\b(us|usa|united states|america)\b/.test(s)) return 'USA'; if (/\b(uk|gb|united kingdom|britain|england|scotland|wales|northern ireland)\b/.test(s)) return 'UK'; if (/german|deutschland/.test(s)) return 'Germany'; if (/france|french/.test(s)) return 'France'; if (/netherland|dutch|holland/.test(s)) return 'Netherlands'; if (/ireland/.test(s)) return 'Ireland'; return s ? 'Other' : ''; };
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function recompute(c) {
  const lastActivity = c.lastActivityAt ? Date.parse(c.lastActivityAt) : Date.parse(c.createdAt || now());
  const idleDays = (Date.now() - lastActivity) / 864e5;
  let stage = c.stage || 'New';
  if (c.suppressed) stage = 'Unsubscribed';
  else if (idleDays > 60 && !['Unsubscribed'].includes(stage)) stage = 'Dormant';
  else if ((Number(c.engagement) || 0) >= 60 && ['New', 'Engaged'].includes(stage)) stage = 'Qualified';
  return { ...c, stage, segments: segmentsOf({ ...c, stage }), emailable: isEmailable({ ...c, stage }) };
}

/** Create or merge a contact by e-mail. Arrays merge; text fields fill gaps. */
async function upsert(email, patch, { source = 'Other', actor = 'system' } = {}) {
  email = normEmail(email);
  if (!validEmail(email)) throw Object.assign(new Error('A valid e-mail address is required'), { status: 400 });
  const cur = await contacts.byExtKey(`email:${email}`);
  const merged = cur ? { ...cur } : { email, source, stage: 'New', engagement: 10, interests: [], history: [] };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) merged[k] = [...new Set([...(merged[k] || []), ...v.map(x => String(x).toLowerCase())])].slice(0, 25);
    else if (k === 'needs' && merged.needs) merged.needs = [...new Set([merged.needs, v].join('; ').split('; '))].join('; ').slice(0, 1500);
    else if (k === 'engagement') merged.engagement = Math.max(Number(merged.engagement) || 0, Number(v) || 0);
    else if (k === 'country') merged.country = merged.country || COUNTRY(v) || v;
    else merged[k] = v;
  }
  merged.lastActivityAt = now();
  const body = recompute(merged);
  const saved = cur ? await contacts.update(cur.id, body) : await contacts.insert({ ...body, extKey: `email:${email}` });
  if (!cur) await audit(actor, 'contact created', `contact:${saved.id}`, { source });
  return saved;
}

async function logInteraction(contactId, kind, text, extra = {}) {
  await interactions.insert({ contactId, kind, text: String(text).slice(0, 2000), ...extra });
  const c = await contacts.get(contactId); if (!c) return;
  const bump = { 'Email open': 3, 'Email click': 10, Chatbot: 15, Enquiry: 20, 'Affiliate click': 10, Note: 0 }[kind] ?? 2;
  await contacts.update(contactId, recompute({ ...c, engagement: Math.min(100, (Number(c.engagement) || 0) + bump), lastActivityAt: now(), history: [...(c.history || []), { at: now(), kind, text: String(text).slice(0, 300) }].slice(-50) }));
}

/** Consent with proof: who, what text, where, when. */
async function recordConsent({ contactId, email, consentText, source, page, ip }) {
  if (!consentText) throw Object.assign(new Error('Consent text is required'), { status: 400 });
  const ipHash = ip ? crypto.createHash('sha256').update(config.security.ipHashSalt + ip).digest('hex').slice(0, 32) : '';
  await db()('consent_log').insert({ contact_id: contactId, email: normEmail(email), action: 'granted', consent_text: consentText, source, page: String(page || '').slice(0, 500), ip_hash: ipHash, at: now() });
  const c = await contacts.get(contactId);
  await db()('suppression').where({ email: normEmail(email) }).delete();
  return contacts.update(contactId, recompute({ ...c, consentEmail: true, consentAt: now(), consentNote: `${source}: "${consentText}"`, suppressed: false, stage: c.stage === 'Unsubscribed' ? 'Engaged' : c.stage }));
}

async function withdrawConsent(email, reason = 'unsubscribed', actor = 'system') {
  email = normEmail(email);
  await db()('suppression').insert({ email, reason, at: now() }).onConflict('email').merge();
  const c = await contacts.byExtKey(`email:${email}`);
  if (c) {
    await db()('consent_log').insert({ contact_id: c.id, email, action: 'withdrawn', consent_text: reason, source: 'system', page: '', ip_hash: '', at: now() });
    await contacts.update(c.id, recompute({ ...c, consentEmail: false, suppressed: true, stage: 'Unsubscribed', history: [...(c.history || []), { at: now(), kind: 'Consent', text: `Withdrawn: ${reason}` }].slice(-50) }));
    await audit(actor, 'consent withdrawn', `contact:${c.id}`, { reason });
  }
}
async function isSuppressed(email) { return !!(await db()('suppression').where({ email: normEmail(email) }).first()); }

/** Hourly: recompute stages and segments for everyone (engagement decay → Dormant, etc.). */
async function recomputeAll() {
  let changed = 0;
  for (const c of await contacts.list({ limit: 100000 })) {
    const r = recompute(c);
    if (r.stage !== c.stage || JSON.stringify(r.segments) !== JSON.stringify(c.segments)) { await contacts.update(c.id, r); changed++; }
  }
  return { changed };
}

async function aiProfile(id) {
  const c = await contacts.get(id); if (!c) throw Object.assign(new Error('Contact not found'), { status: 404 });
  const active = (await repo('offers').list({ status: 'Active', limit: 100 })).map(o => `${o.name} (${o.category})`);
  const text = await ai.complete('contact.profile', `Build a short CRM profile (no medical inferences beyond what they said). Sections: Who they are, What they need, Content to send, Offer categories that fit (only from ACTIVE offers), Next best action.\nActive offers: ${active.join('; ') || 'none'}\nContact: ${JSON.stringify({ country: c.country, vertical: c.vertical, interests: c.interests, needs: c.needs, stage: c.stage, engagement: c.engagement, history: (c.history || []).slice(-10) })}`, { tier: 'quick' });
  return contacts.update(id, { profile: text, profiledAt: now() });
}

module.exports = { upsert, logInteraction, recordConsent, withdrawConsent, isSuppressed, recomputeAll, recompute, aiProfile, normEmail, COUNTRY };
