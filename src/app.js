// HTTP API: admin API (token + role protected), public website endpoints (chatbot, forms),
// webhooks, the admin console and the chatbot widget.
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const log = require('./logger');
const { repo, db, DOC_TABLES } = require('./db');
const { requireRole, createUser } = require('./lib/auth');
const ai = require('./lib/ai');
const auditLib = require('./lib/audit');
const offers = require('./services/offers');
const content = require('./services/content');
const creatives = require('./services/creatives');
const social = require('./services/social');
const chatbot = require('./services/chatbot');
const crm = require('./services/crm');
const email = require('./services/email');
const analytics = require('./services/analytics');
const jobs = require('./jobs');
const ml = require('./connectors/mailerlite');
const intel = require('./services/intelligence');
const video = require('./services/video');
const structure = require('./services/structure');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Fields that only dedicated, rule-enforcing endpoints may change.
const PROTECTED = {
  offers: ['status', 'activatedAt', 'activatedBy', 'affiliateLink', 'score', 'evaluation'],
  content: ['factsVerified', 'verifiedBy', 'publishedAt', 'wpId', 'wpUrl'],
  contacts: ['consentEmail', 'consentAt', 'suppressed', 'extKey', 'email'],
  campaigns: ['mlId', 'approvedBy', 'sentAt'],
};
function cleanPatch(table, body, isCreate) {
  const b = { ...body }; delete b.id; delete b.createdAt; delete b.updatedAt;
  for (const k of PROTECTED[table] || []) if (!(isCreate && table === 'contacts' && k === 'email')) delete b[k];
  if (table === 'content' && b.status === 'Published') throw Object.assign(new Error('Use “Approve & publish” to publish content'), { status: 400 });
  if (table === 'campaigns' && ['Sending', 'Sent'].includes(b.status)) throw Object.assign(new Error('Use “Approve & send” to send a campaign'), { status: 400 });
  if (table === 'offers' && isCreate) b.status = 'Discovered';
  return b;
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(express.json({ limit: '2mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

  app.get('/health', wrap(async (req, res) => { await db().raw('select 1'); res.json({ ok: true }); }));
  app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
  app.get('/', (req, res) => res.redirect('/admin/'));
  app.use('/media', express.static(path.join(__dirname, '../data/media'), { maxAge: '7d' }));
  app.get('/widget.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, '../public/widget.js')));

  /* ---------- Public website endpoints (called by the WordPress site) ---------- */
  const pub = express.Router();
  pub.use(cors({ origin: (o, cb) => cb(null, !o || config.siteOrigins.includes(o) || config.env !== 'production') }));
  pub.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));
  pub.get('/consent-text', (req, res) => res.json({ text: chatbot.CONSENT_TEXT }));
  pub.post('/chat', wrap(async (req, res) => res.json(await chatbot.reply(req.body.sessionId, req.body.message, req.body.page))));
  pub.post('/lead', wrap(async (req, res) => res.json(await chatbot.lead({ ...req.body, ip: req.ip, source: req.body.source === 'form' ? 'Subscription form' : 'Chatbot' }))));
  pub.post('/subscribe', wrap(async (req, res) => res.json(await chatbot.lead({ ...req.body, ip: req.ip, source: req.body.leadMagnet ? 'Lead magnet' : 'Subscription form', interests: req.body.interests }))));
  pub.post('/contact', wrap(async (req, res) => {
    const { name, email: em, message, consent, page } = req.body;
    const c = await crm.upsert(em, { name, needs: String(message || '').slice(0, 1000) }, { source: 'Contact form' });
    await crm.logInteraction(c.id, 'Enquiry', String(message || '').slice(0, 1000));
    if (consent === true) await crm.recordConsent({ contactId: c.id, email: em, consentText: chatbot.CONSENT_TEXT, source: 'Contact form', page, ip: req.ip });
    await require('./services/tasks').add(`enquiry:${c.id}:${Date.now()}`, { title: `Reply to enquiry from ${name || em}`, detail: String(message || '').slice(0, 500), module: 'crm', ref: `contact:${c.id}`, priority: 'High' });
    res.json({ ok: true });
  }));
  app.use('/public', pub);

  /* ---------- Webhooks ---------- */
  app.post('/webhooks/mailerlite', wrap(async (req, res) => {
    if (!ml.verifySignature(req.rawBody || Buffer.from(''), req.headers.signature)) return res.status(401).json({ error: 'Invalid signature' });
    res.json(await email.handleWebhook(req.body));
  }));

  /* ---------- Admin API ---------- */
  const api = express.Router();
  const viewer = requireRole('viewer'), editor = requireRole('editor'), approver = requireRole('approver'), admin = requireRole('admin');

  api.get('/me', viewer, (req, res) => res.json(req.user));
  api.post('/users', admin, wrap(async (req, res) => res.status(201).json(await createUser(req.body.name, req.body.role))));

  // Domain actions (rules enforced in services)
  api.post('/offers/:id/transition', editor, wrap(async (req, res) => res.json(await offers.transition(req.params.id, req.body.to, req.user, req.body))));
  api.post('/offers/:id/evaluate', editor, wrap(async (req, res) => res.json(await offers.evaluate(req.params.id))));
  api.post('/offers/import', editor, wrap(async (req, res) => res.json(await offers.importFeed(req.body.rows || [], req.body.network || 'Other'))));
  api.post('/content/:id/generate', editor, wrap(async (req, res) => res.json(await content.generate(req.params.id, req.user))));
  api.post('/content/:id/push-draft', editor, wrap(async (req, res) => res.json(await content.pushDraft(req.params.id))));
  api.post('/content/:id/approve', approver, wrap(async (req, res) => res.json(await content.approveAndPublish(req.params.id, req.user, req.body))));
  api.post('/content/:id/creatives', editor, wrap(async (req, res) => res.json(await creatives.forContent(req.params.id))));
  api.post('/content/:id/repurpose', editor, wrap(async (req, res) => res.json(await social.repurpose(req.params.id))));
  api.post('/content/:id/video', editor, wrap(async (req, res) => res.json(await video.render(req.params.id))));
  api.post('/ads/import', editor, wrap(async (req, res) => res.json(await intel.importAds(req.body.rows || [], req.body.source || 'Import'))));
  api.post('/structure/propose', editor, wrap(async (req, res) => res.json(await structure.propose())));
  api.post('/plans/:id/apply', approver, wrap(async (req, res) => res.json(await structure.apply(req.params.id, req.user, req.body))));
  api.post('/plans/:id/reject', approver, wrap(async (req, res) => { await structure.reject(req.params.id, req.user, req.body.reason); res.json({ ok: true }); }));
  api.post('/contacts/:id/profile', editor, wrap(async (req, res) => res.json(await crm.aiProfile(req.params.id))));
  api.post('/contacts/:id/interaction', editor, wrap(async (req, res) => { await crm.logInteraction(req.params.id, req.body.kind || 'Note', req.body.text || ''); res.json(await repo('contacts').get(req.params.id)); }));
  api.post('/contacts/:id/withdraw', editor, wrap(async (req, res) => { const c = await repo('contacts').get(req.params.id); await crm.withdrawConsent(c.email, req.body.reason || 'manual', req.user); res.json(await repo('contacts').get(req.params.id)); }));
  api.post('/contacts/:id/consent', editor, wrap(async (req, res) => { const c = await repo('contacts').get(req.params.id); res.json(await crm.recordConsent({ contactId: c.id, email: c.email, consentText: req.body.consentText, source: req.body.source || 'Manual (documented)', page: req.body.page || '' })); }));
  api.post('/campaigns/draft', editor, wrap(async (req, res) => res.json(await email.draft(req.body))));
  api.post('/campaigns/:id/send', approver, wrap(async (req, res) => res.json(await email.approveAndSend(req.params.id, req.user))));
  api.post('/chats/:sessionId/process', editor, wrap(async (req, res) => res.json(await chatbot.processBySession(req.params.sessionId))));
  api.get('/analytics/dashboard', viewer, wrap(async (req, res) => res.json(await analytics.dashboard(Number(req.query.days) || 30))));
  api.get('/jobs', viewer, wrap(async (req, res) => res.json(await jobs.status())));
  api.post('/jobs/:name/run', editor, wrap(async (req, res) => res.json(await jobs.runJob(req.params.name))));
  api.get('/audit', viewer, wrap(async (req, res) => res.json((await auditLib.recent({ ref: req.query.ref, limit: Number(req.query.limit) || 200 })).map(a => ({ id: String(a.id), action: a.action, ref: a.ref, detail: a.detail, by: a.actor, createdAt: a.at })))));
  api.post('/ai/complete', editor, wrap(async (req, res) => res.json({ text: await ai.complete('console.free', String(req.body.prompt || ''), { tier: req.body.tier === 'quick' ? 'quick' : 'default' }) })));
  api.post('/ai/json', editor, wrap(async (req, res) => res.json({ value: await ai.json('console.free', String(req.body.prompt || ''), { tier: req.body.tier === 'quick' ? 'quick' : 'default' }) })));

  // Generic record API for every collection (protected fields stripped)
  api.get('/:coll', viewer, wrap(async (req, res) => res.json(await repo(req.params.coll).list({ status: req.query.status, limit: Math.min(Number(req.query.limit) || 500, 5000) }))));
  api.get('/:coll/:id', viewer, wrap(async (req, res) => { const d = await repo(req.params.coll).get(req.params.id); d ? res.json(d) : res.status(404).json({ error: 'Not found' }); }));
  api.post('/:coll', editor, wrap(async (req, res) => {
    const t = req.params.coll;
    if (t === 'contacts') return res.status(201).json(await crm.upsert(req.body.email, cleanPatch(t, req.body, true), { source: req.body.source || 'Manual', actor: req.user }));
    const doc = await repo(t).insert(cleanPatch(t, req.body, true));
    await auditLib.audit(req.user, `${t} created`, `${t}:${doc.id}`, null);
    res.status(201).json(doc);
  }));
  api.patch('/:coll/:id', editor, wrap(async (req, res) => {
    const t = req.params.coll; let patch = cleanPatch(t, req.body, false);
    if (t === 'contacts') { const cur = await repo(t).get(req.params.id); patch = crm.recompute({ ...cur, ...patch }); }
    if (t === 'content' && patch.offerId) { const o = await repo('offers').get(patch.offerId); if (!offers.isPromotable(o)) throw Object.assign(new Error('Content can only be linked to an Active offer'), { status: 409 }); }
    res.json(await repo(t).update(req.params.id, patch));
  }));
  api.delete('/:coll/:id', editor, wrap(async (req, res) => {
    if (req.params.coll === 'contacts' && req.user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can delete customer records' });
    await repo(req.params.coll).remove(req.params.id); await auditLib.audit(req.user, `${req.params.coll} deleted`, `${req.params.coll}:${req.params.id}`, null); res.json({ ok: true });
  }));
  app.use('/api', api);

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status && err.status < 600 ? err.status : 500;
    if (status >= 500) log.error({ err: err.message, stack: err.stack, path: req.path }, 'request failed');
    res.status(status).json({ error: status >= 500 && config.env === 'production' ? 'Something went wrong. It has been logged.' : err.message });
  });
  return app;
}

module.exports = { createApp, DOC_TABLES };
