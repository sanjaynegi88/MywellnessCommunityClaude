// YouTube Data API v3.
//  - Channel search + statistics (API key) for community research.
//  - Video upload (OAuth refresh token for the MWC channel, scope youtube.upload). Videos uploaded
//    from unverified API projects are locked to private until Google's API compliance audit passes.
const fs = require('fs');
const { request } = require('../lib/http');
const config = require('../config');
const y = config.connectors.youtube;

let tok = null;
async function accessToken() {
  if (tok && tok.exp > Date.now()) return tok.token;
  const r = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: y.clientId, client_secret: y.clientSecret, refresh_token: y.refreshToken, grant_type: 'refresh_token' }).toString() });
  tok = { token: r.access_token, exp: Date.now() + ((r.expires_in || 3600) - 60) * 1000 };
  return tok.token;
}

const search = {
  configured: () => !!y.apiKey,
  async channels(q, max = 10) {
    const s = await request('https://www.googleapis.com/youtube/v3/search', { query: { part: 'snippet', type: 'channel', q, maxResults: max, key: y.apiKey } });
    const ids = (s.items || []).map(i => i.snippet?.channelId || i.id?.channelId).filter(Boolean);
    if (!ids.length) return [];
    const c = await request('https://www.googleapis.com/youtube/v3/channels', { query: { part: 'snippet,statistics', id: ids.join(','), key: y.apiKey } });
    return (c.items || []).map(ch => ({
      extKey: `youtube:${ch.id}`, platform: 'YouTube', name: ch.snippet.title, url: `https://www.youtube.com/channel/${ch.id}`,
      description: String(ch.snippet.description || '').slice(0, 400), audience: Number(ch.statistics?.subscriberCount || 0),
      activity: Number(ch.statistics?.videoCount || 0), country: ch.snippet.country || '',
    }));
  },
};

const uploader = {
  configured: () => !!(y.clientId && y.clientSecret && y.refreshToken),
  /** Multipart upload of a local MP4 (Shorts: vertical, ≤ 60 s, #Shorts in title/description). */
  async upload({ filePath, title, description, tags = [] }) {
    const video = fs.readFileSync(filePath);
    const boundary = 'mwc360' + Date.now();
    const meta = { snippet: { title: String(title).slice(0, 100), description: String(description || '').slice(0, 4900), tags: tags.slice(0, 15), categoryId: '26' }, status: { privacyStatus: y.privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: true } };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
      video, Buffer.from(`\r\n--${boundary}--`),
    ]);
    const r = await request('https://www.googleapis.com/upload/youtube/v3/videos', { method: 'POST', query: { uploadType: 'multipart', part: 'snippet,status' }, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body, timeoutMs: 300000, retries: 1 });
    return { id: r.id, url: `https://www.youtube.com/shorts/${r.id}` };
  },
  async stats(videoId) {
    const r = await request('https://www.googleapis.com/youtube/v3/videos', { query: { part: 'statistics', id: videoId }, headers: { Authorization: `Bearer ${await accessToken()}` } });
    const s = r.items?.[0]?.statistics || {};
    return { reach: Number(s.viewCount || 0), engagement: Number(s.likeCount || 0) + Number(s.commentCount || 0) };
  },
};

module.exports = { search, uploader };
