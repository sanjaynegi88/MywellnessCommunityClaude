// Creative generation: platform-sized banners (SVG → PNG) with AI-written copy, plus video scripts.
// Banners use MWC's own templates and copy — never competitor assets.
const fs = require('fs');
const path = require('path');
const { repo } = require('../db');
const ai = require('../lib/ai');
const config = require('../config');
const wp = require('../connectors/wordpress');

const MEDIA_DIR = path.resolve(__dirname, '../../data/media');
const SIZES = { facebook: [1200, 628], instagram: [1080, 1080], pinterest: [1000, 1500] };
const PALETTE = { Nutra: ['#1E6B52', '#E6F0EB'], Pet: ['#5B3A86', '#EFE8F7'], Both: ['#1E4F6B', '#E6EEF3'] };

const esc = (s) => String(s || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function wrap(text, max) { const words = String(text).split(/\s+/); const lines = []; let l = ''; for (const w of words) { if ((l + ' ' + w).trim().length > max) { lines.push(l.trim()); l = w; } else l += ' ' + w; } if (l.trim()) lines.push(l.trim()); return lines.slice(0, 4); }

function svg([w, h], { headline, sub, cta }, vertical) {
  const [ink, bg] = PALETTE[vertical] || PALETTE.Both;
  const hs = Math.round(w / 14), ss = Math.round(w / 30);
  const hl = wrap(headline, Math.round(w / hs * 1.7)); const sl = wrap(sub, Math.round(w / ss * 1.8));
  let y = h * 0.28;
  const head = hl.map((l, i) => `<text x="${w * 0.08}" y="${y + i * hs * 1.15}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${hs}" fill="${ink}">${esc(l)}</text>`).join('');
  y += hl.length * hs * 1.15 + ss;
  const subT = sl.map((l, i) => `<text x="${w * 0.08}" y="${y + i * ss * 1.3}" font-family="Helvetica, Arial, sans-serif" font-size="${ss}" fill="#2a3a33">${esc(l)}</text>`).join('');
  const by = h - h * 0.16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="${bg}"/><circle cx="${w * 0.92}" cy="${h * 0.1}" r="${Math.min(w, h) * 0.32}" fill="${ink}" opacity="0.08"/>
<rect x="0" y="0" width="${w * 0.02}" height="${h}" fill="${ink}"/>${head}${subT}
<rect x="${w * 0.08}" y="${by - ss * 1.6}" rx="${ss * 0.5}" width="${Math.max(ss * 9, esc(cta).length * ss * 0.62)}" height="${ss * 2.2}" fill="${ink}"/>
<text x="${w * 0.08 + ss * 0.8}" y="${by - ss * 0.15}" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${ss}" fill="#fff">${esc(cta)}</text>
<text x="${w * 0.92}" y="${h - h * 0.05}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(ss * 0.7)}" fill="${ink}">mywellnesscommunity.com</text></svg>`;
}

async function forContent(contentId) {
  const c = await repo('content').get(contentId);
  if (!c) throw Object.assign(new Error('Content not found'), { status: 404 });
  const copy = await ai.json('creative.copy', `Write banner copy for this MWC page. Original wording only, no health claims, no prices. Reply JSON {"headline": max 7 words, "sub": max 12 words, "cta": max 3 words}.\nPage: ${c.title}\n${String(c.body || '').slice(0, 2000)}`, { tier: 'quick', context: c });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const sharp = require('sharp');
  const files = {};
  for (const [platform, size] of Object.entries(SIZES)) {
    const name = `${contentId}-${platform}.png`;
    const png = await sharp(Buffer.from(svg(size, copy, c.vertical))).png().toBuffer();
    fs.writeFileSync(path.join(MEDIA_DIR, name), png);
    let url = `${config.publicBaseUrl}/media/${name}`;
    if (wp.configured()) { try { const m = await wp.uploadMedia(png, name); url = m.source_url || url; } catch (_) { /* keep local URL */ } }
    files[platform] = url;
  }
  const script = await ai.complete('content.generate', `Write a 20–30 second vertical video script (Reels/Shorts/TikTok) for this MWC page: hook in the first 2 seconds, 4–6 scenes with on-screen text and voice-over, ending with "Read the full guide at mywellnesscommunity.com". No health claims, no fake testimonials.\nPage: ${c.title}\n${String(c.body || '').slice(0, 2000)}`, { tier: 'quick', context: { title: c.title } });
  return repo('creatives').upsertByExtKey(`content:${contentId}`, { contentId, kind: 'Banner set', status: 'Ready', copy, files, videoScript: script, vertical: c.vertical, offerId: c.offerId || '' });
}

module.exports = { forContent, svg };
