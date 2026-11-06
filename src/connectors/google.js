// Google Analytics 4 Data API + Search Console API with a service account
// (add the service account e-mail as a Viewer on the GA4 property and as a user in Search Console).
const fs = require('fs');
const { request } = require('../lib/http');
const config = require('../config');
const g = config.connectors.google;

const auths = new Map();
async function token(scopes = ['https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly']) {
  const key = scopes.join(' ');
  if (!auths.has(key)) {
    const { GoogleAuth } = require('google-auth-library');
    const raw = g.serviceAccountJson.trim().startsWith('{') ? g.serviceAccountJson : fs.readFileSync(g.serviceAccountJson, 'utf8');
    auths.set(key, new GoogleAuth({ credentials: JSON.parse(raw), scopes }));
  }
  const client = await auths.get(key).getClient();
  return (await client.getAccessToken()).token;
}

const ga4 = {
  configured: () => !!(g.serviceAccountJson && g.ga4PropertyId),
  /** Page performance incl. the affiliate_click key event set up in GTM. */
  async pageReport(days = 7) {
    const body = {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
      dimensions: [{ name: 'pagePath' }, { name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'keyEvents' }],
      limit: 500,
    };
    const r = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${g.ga4PropertyId}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, json: body });
    return (r.rows || []).map(row => ({
      page: row.dimensionValues[0].value, channel: row.dimensionValues[1].value,
      sessions: Number(row.metricValues[0].value), engaged: Number(row.metricValues[1].value), conversions: Number(row.metricValues[2].value),
    }));
  },
  async eventReport(eventName = 'affiliate_click', days = 7) {
    const body = {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }],
      dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: eventName } } }, limit: 500,
    };
    const r = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${g.ga4PropertyId}:runReport`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, json: body });
    return (r.rows || []).map(row => ({ page: row.dimensionValues[0].value, clicks: Number(row.metricValues[0].value) }));
  },
};

const searchConsole = {
  configured: () => !!(g.serviceAccountJson && g.gscSiteUrl),
  async queries(days = 28, dimensions = ['query', 'page']) {
    const end = new Date(Date.now() - 2 * 864e5); const start = new Date(end - days * 864e5);
    const r = await request(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(g.gscSiteUrl)}/searchAnalytics/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${await token()}` },
      json: { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), dimensions, rowLimit: 1000 },
    });
    return (r.rows || []).map(x => ({ query: x.keys[0], page: x.keys[1], clicks: x.clicks, impressions: x.impressions, ctr: x.ctr, position: x.position }));
  },
};

/** Google Cloud Text-to-Speech (same service account; enable the API in the project). */
const tts = {
  configured: () => !!(g.serviceAccountJson && config.video.tts),
  async synthesize(text, voice = config.video.ttsVoice) {
    const r = await request('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST', headers: { Authorization: `Bearer ${await token(['https://www.googleapis.com/auth/cloud-platform'])}` },
      json: { input: { text: String(text).slice(0, 4500) }, voice: { languageCode: voice.split('-').slice(0, 2).join('-'), name: voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: 1.05 } },
    });
    return Buffer.from(r.audioContent, 'base64');
  },
};

module.exports = { ga4, searchConsole, tts };
