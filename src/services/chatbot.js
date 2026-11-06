// Section 4: website chatbot — customer assistance + primary market research.
// Answers only from verified MWC content and ACTIVE offers; asks for consent before storing contacts.
const crypto = require('crypto');
const { repo, now } = require('../db');
const ai = require('../lib/ai');
const config = require('../config');
const crm = require('./crm');

const chats = repo('chats');
const CONSENT_TEXT = 'I agree to receive wellness tips and offers from My Wellness Community by email. I can unsubscribe at any time.';

async function rules() {
  const offers = (await repo('offers').list({ status: 'Active', limit: 100 })).map(o => `- ${o.name} (${o.vertical}; ${o.category}; markets ${o.markets})`).join('\n') || '- (no active offers — do not recommend specific products)';
  const pages = (await repo('content').list({ status: 'Published', limit: 60 })).map(c => `- ${c.title} [${c.type}] ${c.wpUrl || ''}`).join('\n') || '- (no published pages yet)';
  return `${ai.BRAND_RULES}
You are the MWC website assistant ("MWC Wellness Guide"). Goals: (1) help visitors warmly and briefly; (2) learn about them for primary research — needs, problems, interests, product preferences, buying considerations, country, expectations from MWC, unmet needs and suggestions. Ask at most one natural question per reply. Under 90 words.
Recommend ONLY these active offers, when relevant:\n${offers}
Point to these verified MWC pages:\n${pages}
Never diagnose; suggest a doctor or vet for health concerns. Never ask for an email address yourself — the site shows a consent form for that.`;
}

async function reply(sessionId, message, page) {
  if (!message || String(message).length > 2000) throw Object.assign(new Error('Message must be 1–2000 characters'), { status: 400 });
  sessionId = /^[a-zA-Z0-9_-]{8,64}$/.test(sessionId || '') ? sessionId : crypto.randomBytes(12).toString('hex');
  const ext = `session:${sessionId}`;
  let s = await chats.byExtKey(ext);
  if (!s) s = await chats.insert({ extKey: ext, status: 'Open', turns: [], pages: [] });
  const turns = [...(s.turns || []), { role: 'user', content: String(message), at: now() }];
  const text = await ai.complete('chat.reply', [{ role: 'user', content: (await rules()) + '\n\n(Conversation with a website visitor follows.)' }, ...turns.slice(-16).map(t => ({ role: t.role, content: t.content }))], { tier: 'quick', maxTokens: 400 });
  turns.push({ role: 'assistant', content: text, at: now() });
  await chats.update(s.id, { turns: turns.slice(-60), lastAt: now(), status: 'Open', pages: [...new Set([...(s.pages || []), page].filter(Boolean))].slice(-20) });
  return { sessionId, reply: text };
}

/** Lead capture from the widget or any site form. Requires explicit consent. */
async function lead({ sessionId, name, email, consent, consentText, page, ip, source = 'Chatbot', interests, vertical }) {
  if (consent !== true) throw Object.assign(new Error('Consent is required to save your details'), { status: 400 });
  const contact = await crm.upsert(email, { name, vertical, interests: interests || [] }, { source });
  await crm.recordConsent({ contactId: contact.id, email, consentText: consentText || CONSENT_TEXT, source, page, ip });
  if (sessionId) { const s = await chats.byExtKey(`session:${sessionId}`); if (s) await chats.update(s.id, { contactId: contact.id }); }
  await crm.logInteraction(contact.id, source === 'Chatbot' ? 'Chatbot' : 'Enquiry', `${source} sign-up on ${page || 'site'}`);
  return { ok: true };
}

/** Turns one finished chat into research: summary, needs, questions → insights + CRM enrichment. */
async function processSession(s) {
  const res = { insights: 0 };
    const transcript = s.turns.map(t => `${t.role === 'user' ? 'Visitor' : 'Bot'}: ${t.content}`).join('\n');
    const x = await ai.json('chat.extract', `Extract primary-research data from this MWC website chat. Only include what the visitor actually said.
Reply JSON {"summary": one sentence, "vertical":"Nutra"|"Pet"|"Both"|"", "country": string, "interests": [short lowercase topics], "needs": [..], "questions": [..], "preferences": [..], "unmetNeeds": [..], "suggestions": [..], "engagement": 0-100}.\n\n${transcript.slice(0, 30000)}`, { tier: 'quick' });
    await chats.update(s.id, { status: 'Processed', summary: x.summary, vertical: x.vertical, country: x.country, interests: x.interests || [], needs: x.needs || [], questions: x.questions || [], preferences: x.preferences || [], unmetNeeds: x.unmetNeeds || [], suggestions: x.suggestions || [], processedAt: now() });
    const ins = repo('insights');
    const add = async (arr, kind, module, priority) => { for (const t of (arr || []).slice(0, 5)) { await ins.insert({ text: String(t), kind, source: 'Chatbot', module, priority, status: 'Open', chatId: s.id, vertical: x.vertical }); res.insights++; } };
    await add(x.unmetNeeds, 'Unmet need', 'offers', 'High');
    await add(x.questions, 'Question', 'content', 'Medium');
    await add(x.suggestions, 'Suggestion', 'learning', 'Low');
    if (s.contactId) {
      const c = await repo('contacts').get(s.contactId);
      if (c) { await crm.upsert(c.email, { vertical: x.vertical, country: x.country, interests: x.interests, needs: (x.needs || []).join('; '), engagement: x.engagement }, { source: 'Chatbot' }); await crm.logInteraction(c.id, 'Chatbot', x.summary || 'Chat session'); }
    }
    return res;
}

/** Every 10 minutes: idle sessions → structured research → insights + CRM enrichment. */
async function processIdle() {
  const cutoff = Date.now() - config.automation.chatIdleMinutes * 60000;
  const open = (await chats.list({ status: 'Open', limit: 200 })).filter(s => Date.parse(s.lastAt || s.updatedAt) < cutoff && (s.turns || []).some(t => t.role === 'user'));
  const out = { processed: 0, insights: 0 };
  for (const s of open) { const r = await processSession(s); out.processed++; out.insights += r.insights; }
  return out;
}

async function processBySession(sessionId) { const s = await chats.byExtKey(`session:${sessionId}`); if (!s) throw Object.assign(new Error('Session not found'), { status: 404 }); return processSession(s); }

module.exports = { reply, lead, processIdle, processSession, processBySession, CONSENT_TEXT };
