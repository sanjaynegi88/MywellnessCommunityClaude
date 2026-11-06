// Social media: repurpose published pages into platform posts, schedule, publish through
// official APIs, collect performance and feed it back. Platforms without an approved
// publishing API get "Ready" posts + a human task (never marked Posted unless really posted).
const { repo } = require('../db');
const ai = require('../lib/ai');
const { publishers } = require('../connectors/social');
const offersSvc = require('./offers');
const tasks = require('./tasks');

const social = repo('social');
const PLATFORMS = ['Facebook', 'Instagram', 'Pinterest', 'TikTok', 'YouTube'];

function utm(url, platform, id) {
  try { const u = new URL(url); u.searchParams.set('utm_source', platform.toLowerCase()); u.searchParams.set('utm_medium', 'social'); u.searchParams.set('utm_campaign', 'mwc360'); u.searchParams.set('utm_content', id); return u.href; } catch (_) { return url; }
}
function nextSlot(i) { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1 + Math.floor(i / 2)); d.setUTCHours(i % 2 ? 17 : 11, 0, 0, 0); return d.toISOString(); }

async function repurpose(contentId) {
  const c = await repo('content').get(contentId);
  if (!c) throw Object.assign(new Error('Content not found'), { status: 404 });
  if (c.offerId && !offersSvc.isPromotable(await repo('offers').get(c.offerId))) throw Object.assign(new Error('Linked offer is not Active'), { status: 409 });
  const creative = await repo('creatives').byExtKey(`content:${contentId}`);
  const posts = await ai.json('social.repurpose', `Repurpose this MWC website page into social posts, one per platform: ${PLATFORMS.join(', ')}.
Reply JSON array of {"platform": string, "format": "Post"|"Reel/Short"|"Pin"|"Carousel"|"Video", "caption": string}. Platform-appropriate tone and length, a reason to read the full page, hashtags where suitable. For TikTok/YouTube write a 15–30s script with a 2-second hook. No health claims, no fake testimonials${c.offerId ? ', include #ad / affiliate disclosure' : ''}.
Title: ${c.title}\n${String(c.body || '').slice(0, 6000)}`, { context: c });
  const created = [];
  for (const [i, p] of (Array.isArray(posts) ? posts : []).entries()) {
    const platform = String(p.platform || ''); if (!platform) continue;
    const pub = publishers[platform];
    const video = creative?.video;
    const hasMedia = pub?.needsVideo ? !!video?.url : true;
    const canPublish = pub?.configured?.() && c.status === 'Published' && hasMedia;
    const imageUrl = creative?.files?.[platform === 'Pinterest' ? 'pinterest' : platform === 'Instagram' ? 'instagram' : 'facebook'];
    const caption = pub?.needsVideo && video?.caption ? `${String(p.caption || '')}\n\n${video.caption}`.slice(0, 2200) : String(p.caption || '');
    const doc = await social.insert({ platform, format: String(p.format || 'Post'), caption, title: c.title, contentId, offerId: c.offerId || '', link: c.wpUrl ? utm(c.wpUrl, platform, contentId) : '', imageUrl: imageUrl || '', videoUrl: video?.url || '', videoFile: video?.file || '', date: nextSlot(i), status: canPublish ? 'Scheduled' : 'Ready' });
    if (!canPublish) await tasks.add(`manual-post:${doc.id}`, { title: `Post to ${platform}: "${c.title}"`, detail: !pub ? `No ${platform} connector.` : !pub.configured() ? `${platform} connector not configured — add its keys, or post manually${video?.url ? ` (video: ${video.url})` : ''}.` : !hasMedia ? 'Video not rendered yet.' : 'Page not yet published.', module: 'social', ref: `social:${doc.id}`, priority: 'Low' });
    created.push(doc);
  }
  return { created: created.length };
}

/** Every 15 minutes: publish due posts on platforms with an official API connection. */
async function publishDue() {
  const due = (await social.list({ status: 'Scheduled', limit: 200 })).filter(p => !p.date || Date.parse(p.date) <= Date.now());
  const out = { posted: 0, blocked: 0, failed: 0 };
  for (const p of due) {
    if (p.offerId && !offersSvc.isPromotable(await repo('offers').get(p.offerId))) { await social.update(p.id, { status: 'Blocked', hold: 'Offer not active' }); out.blocked++; continue; }
    const pub = publishers[p.platform];
    if (!pub?.configured()) { await social.update(p.id, { status: 'Ready' }); continue; }
    try {
      const r = p.platform === 'Pinterest' ? await pub.post({ title: p.caption.split('\n')[0], description: p.caption, link: p.link, imageUrl: p.imageUrl })
        : p.platform === 'Instagram' ? await pub.post({ caption: `${p.caption}\n\nLink in bio`, imageUrl: p.imageUrl })
        : p.platform === 'TikTok' ? await pub.post({ caption: p.caption, videoUrl: p.videoUrl })
        : p.platform === 'YouTube' ? await pub.post({ caption: `${p.caption}\n\n${p.link}`, title: p.title || p.caption.split('\n')[0], videoFile: p.videoFile })
        : await pub.post({ message: p.caption, link: p.link });
      await social.update(p.id, { status: 'Posted', postedAt: new Date().toISOString(), externalId: r.id || r.post_id || '', externalUrl: r.url || '', privacy: r.privacy || '' });
      out.posted++;
    } catch (e) { await social.update(p.id, { status: 'Failed', error: e.message }); out.failed++; }
  }
  return out;
}

/** Daily: performance of posts from the last 30 days → social records + metrics. */
async function insights() {
  const posted = (await social.list({ status: 'Posted', limit: 500 })).filter(p => p.externalId && Date.parse(p.postedAt) > Date.now() - 30 * 864e5);
  let updated = 0;
  for (const p of posted) {
    const pub = publishers[p.platform]; if (!pub?.insights) continue;
    try {
      const m = await pub.insights(p.externalId); await social.update(p.id, { ...m, insightsAt: new Date().toISOString() });
      await repo('metrics').upsertByExtKey(`social:${p.id}`, { date: new Date().toISOString().slice(0, 10), source: 'Social', page: `${p.platform}: ${String(p.caption).slice(0, 60)}`, sessions: m.reach || 0, clicks: m.clicks || 0, contentId: p.contentId });
      updated++;
    } catch (_) { /* metric not available for this post type */ }
  }
  return { updated };
}

module.exports = { repurpose, publishDue, insights, utm };
