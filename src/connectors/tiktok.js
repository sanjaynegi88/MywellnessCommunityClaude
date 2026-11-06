// TikTok official APIs.
//  - Commercial Content API (Ad Library): research access must be approved by TikTok; covers ads shown in the EU.
//      POST /v2/research/adlib/ad/query/  (scope research.adlib.basic)
//  - Content Posting API (Direct Post): scope video.publish. Unaudited apps can only post privately
//      (SELF_ONLY) until TikTok audits the app. PULL_FROM_URL requires the video's domain/URL prefix
//      to be verified in the TikTok developer portal (verify mywellnesscommunity.com).
// VERIFY ON FIRST RUN: the OAuth token request format (client_credentials / refresh_token).
const { request } = require('../lib/http');
const config = require('../config');
const t = config.connectors.tiktok;
const BASE = 'https://open.tiktokapis.com/v2';

const form = (o) => new URLSearchParams(o).toString();
let clientTok = null, userTok = null;

async function clientToken() {
  if (clientTok && clientTok.exp > Date.now()) return clientTok.token;
  const r = await request(`${BASE}/oauth/token/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_key: t.clientKey, client_secret: t.clientSecret, grant_type: 'client_credentials' }) });
  clientTok = { token: r.access_token, exp: Date.now() + ((r.expires_in || 3600) - 60) * 1000 };
  return clientTok.token;
}
async function userToken() {
  if (userTok && userTok.exp > Date.now()) return userTok.token;
  const r = await request(`${BASE}/oauth/token/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_key: t.clientKey, client_secret: t.clientSecret, grant_type: 'refresh_token', refresh_token: t.refreshToken }) });
  userTok = { token: r.access_token, exp: Date.now() + ((r.expires_in || 3600) - 60) * 1000 };
  return userTok.token;
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

const adLibrary = {
  configured: () => !!(t.clientKey && t.clientSecret && t.researchEnabled),
  async search(term, country, days = 90) {
    const fields = 'ad.id,ad.first_shown_date,ad.last_shown_date,ad.status,ad.videos,ad.image_urls,ad.reach,advertiser.business_id,advertiser.business_name';
    const r = await request(`${BASE}/research/adlib/ad/query/`, {
      method: 'POST', query: { fields }, headers: { Authorization: `Bearer ${await clientToken()}` },
      json: { filters: { ad_published_date_range: { min: ymd(new Date(Date.now() - days * 864e5)), max: ymd(new Date()) }, country_code: country }, search_term: String(term).slice(0, 50), search_type: 'fuzzy_phrase', max_count: 10 },
    });
    if (r?.error && r.error.code && r.error.code !== 'ok') throw new Error(`TikTok adlib: ${r.error.message || r.error.code}`);
    return (r?.data?.ads || []).map(x => {
      const first = x.ad?.first_shown_date ? String(x.ad.first_shown_date) : null;
      const startedAt = first && /^\d{8}$/.test(first) ? `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}` : first;
      return {
        extKey: `tiktokad:${x.ad?.id}`, brand: x.advertiser?.business_name || 'Unknown advertiser', platform: 'TikTok',
        format: (x.ad?.videos || []).length ? 'Video' : 'Static image', text: '', startedAt, reach: x.ad?.reach,
        source: `https://library.tiktok.com/ads/detail/?ad_id=${x.ad?.id}`, media: { videos: x.ad?.videos || [], images: x.ad?.image_urls || [] }, country,
      };
    });
  },
};

const poster = {
  configured: () => !!(t.clientKey && t.clientSecret && t.refreshToken),
  async creatorInfo() {
    const r = await request(`${BASE}/post/publish/creator_info/query/`, { method: 'POST', headers: { Authorization: `Bearer ${await userToken()}`, 'Content-Type': 'application/json; charset=UTF-8' }, json: {} });
    return r?.data || {};
  },
  async post({ caption, videoUrl }) {
    if (!videoUrl) throw new Error('TikTok needs a public video URL (render the video first)');
    const info = await this.creatorInfo().catch(() => ({}));
    const options = info.privacy_level_options || [];
    const privacy = options.includes(t.privacyLevel) ? t.privacyLevel : (options.includes('SELF_ONLY') ? 'SELF_ONLY' : t.privacyLevel);
    const r = await request(`${BASE}/post/publish/video/init/`, {
      method: 'POST', headers: { Authorization: `Bearer ${await userToken()}`, 'Content-Type': 'application/json; charset=UTF-8' },
      json: { post_info: { title: String(caption || '').slice(0, 2200), privacy_level: privacy, disable_duet: false, disable_stitch: false, disable_comment: false, brand_content_toggle: false, brand_organic_toggle: true, is_aigc: true }, source_info: { source: 'PULL_FROM_URL', video_url: videoUrl } },
    });
    if (r?.error && r.error.code !== 'ok') throw new Error(`TikTok post: ${r.error.message || r.error.code}`);
    return { id: r.data.publish_id, privacy };
  },
  async status(publishId) {
    return request(`${BASE}/post/publish/status/fetch/`, { method: 'POST', headers: { Authorization: `Bearer ${await userToken()}` }, json: { publish_id: publishId } });
  },
};

module.exports = { adLibrary, poster };
