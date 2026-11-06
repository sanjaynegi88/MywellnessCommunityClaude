// Reddit Data API (application-only OAuth) — finds relevant communities (subreddits) for research.
// Read-only; respects Reddit's API terms (identifying User-Agent, rate limits). No posting.
const { request } = require('../lib/http');
const config = require('../config');
const r = config.connectors.reddit;

let tok = null;
async function token() {
  if (tok && tok.exp > Date.now()) return tok.token;
  const res = await request('https://www.reddit.com/api/v1/access_token', {
    method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${r.clientId}:${r.clientSecret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': r.userAgent },
    body: 'grant_type=client_credentials',
  });
  tok = { token: res.access_token, exp: Date.now() + ((res.expires_in || 3600) - 60) * 1000 };
  return tok.token;
}

module.exports = {
  configured: () => !!(r.clientId && r.clientSecret),
  async communities(q, limit = 15) {
    const res = await request('https://oauth.reddit.com/subreddits/search', { headers: { Authorization: `Bearer ${await token()}`, 'User-Agent': r.userAgent }, query: { q, limit, include_over_18: 'false' } });
    return (res?.data?.children || []).map(c => c.data).filter(d => !d.over18).map(d => ({
      extKey: `reddit:${d.display_name}`, platform: 'Reddit', name: `r/${d.display_name}`, url: `https://www.reddit.com${d.url}`,
      description: String(d.public_description || d.title || '').slice(0, 400), audience: Number(d.subscribers || 0),
      activity: Number(d.accounts_active || d.active_user_count || 0),
    }));
  },
};
