// MailerLite (new API, connect.mailerlite.com). MailerLite only DELIVERS email:
// the MWC database stays the source of truth for contacts, consent and segments.
const crypto = require('crypto');
const { request } = require('../lib/http');
const config = require('../config');
const m = config.connectors.mailerlite;
const BASE = 'https://connect.mailerlite.com/api';
const H = () => ({ Authorization: `Bearer ${m.apiKey}` });

const groupCache = new Map();

module.exports = {
  configured: () => !!m.apiKey,
  async ensureGroup(name) {
    if (groupCache.has(name)) return groupCache.get(name);
    const found = await request(`${BASE}/groups`, { headers: H(), query: { 'filter[name]': name, limit: 25 } });
    let g = (found?.data || []).find(x => x.name === name);
    if (!g) g = (await request(`${BASE}/groups`, { method: 'POST', headers: H(), json: { name } })).data;
    groupCache.set(name, g.id); return g.id;
  },
  /** Create or update a subscriber and set their groups. */
  async upsertSubscriber({ email, name, country, vertical, groups = [] }) {
    const groupIds = [];
    for (const gname of groups) groupIds.push(await this.ensureGroup(gname));
    return request(`${BASE}/subscribers`, { method: 'POST', headers: H(), json: { email, fields: { name, country, vertical }, groups: groupIds, status: 'active' } });
  },
  async unsubscribe(email) {
    return request(`${BASE}/subscribers`, { method: 'POST', headers: H(), json: { email, status: 'unsubscribed' } });
  },
  /** Regular campaign to one or more groups; created as draft, then scheduled by approve step. */
  async createCampaign({ name, subject, fromName = 'My Wellness Community', from, html, groupIds }) {
    return request(`${BASE}/campaigns`, { method: 'POST', headers: H(), json: { name, type: 'regular', emails: [{ subject, from_name: fromName, from, content: html }], groups: groupIds } });
  },
  async scheduleNow(campaignId) { return request(`${BASE}/campaigns/${campaignId}/schedule`, { method: 'POST', headers: H(), json: { delivery: 'instant' } }); },
  async campaign(campaignId) { return request(`${BASE}/campaigns/${campaignId}`, { headers: H() }); },
  async createWebhook(url, events) { return request(`${BASE}/webhooks`, { method: 'POST', headers: H(), json: { name: 'MWC 360 feedback', url, events, enabled: true } }); },
  /** MailerLite signs webhook bodies with HMAC-SHA256 (header "Signature"). VERIFY header name in your webhook settings. */
  verifySignature(rawBody, signature) {
    if (!m.webhookSecret) return false;
    const expected = crypto.createHmac('sha256', m.webhookSecret).update(rawBody).digest('hex');
    try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature || ''))); } catch (_) { return false; }
  },
  WEBHOOK_EVENTS: ['subscriber.unsubscribed', 'subscriber.bounced', 'subscriber.spam_reported', 'subscriber.updated', 'campaign.sent', 'campaign.open', 'campaign.click'],
};
