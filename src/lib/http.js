// Outbound HTTP for all connectors: timeout, retry with backoff on 429/5xx, JSON handling,
// and errors that never include credentials.
const log = require('../logger');

class HttpError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}

async function request(url, { method = 'GET', headers = {}, query, json, body, timeoutMs = 30000, retries = 2, raw = false } = {}) {
  const u = new URL(url);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
  const init = { method, headers: { Accept: 'application/json', ...headers } };
  if (json !== undefined) { init.body = JSON.stringify(json); init.headers['Content-Type'] = 'application/json'; }
  else if (body !== undefined) init.body = body;

  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try { res = await fetch(u, { ...init, signal: ctl.signal }); }
    catch (e) {
      clearTimeout(t);
      if (attempt < retries) { await sleep(backoff(attempt)); continue; }
      throw new HttpError(0, `Network error calling ${u.host}: ${e.message}`);
    }
    clearTimeout(t);
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const ra = Number(res.headers.get('retry-after')); await sleep(ra ? ra * 1000 : backoff(attempt)); continue;
    }
    const text = await res.text();
    let data = text; if (!raw) { try { data = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ } }
    if (!res.ok) {
      log.warn({ host: u.host, path: u.pathname, status: res.status }, 'connector call failed');
      throw new HttpError(res.status, `${u.host} ${u.pathname} → HTTP ${res.status}`, typeof data === 'string' ? data.slice(0, 500) : data);
    }
    return data;
  }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const backoff = (a) => 500 * 2 ** a + Math.floor(Math.random() * 250);

module.exports = { request, HttpError };
