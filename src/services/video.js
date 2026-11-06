// Finished short-form videos (Reels / Shorts / TikTok), rendered in-house:
//   AI storyboard → branded scene frames (SVG → PNG) → optional AI voice-over (Google TTS)
//   → ffmpeg H.264 MP4 1080×1920 with gentle zoom → uploaded to WordPress media (public URL).
// Original MWC visuals and wording only; no stock footage of real products, no health claims.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { repo, now } = require('../db');
const ai = require('../lib/ai');
const config = require('../config');
const wp = require('../connectors/wordpress');
const { tts } = require('../connectors/google');

const MEDIA_DIR = path.resolve(__dirname, '../../data/media');
const PALETTE = { Nutra: ['#1E6B52', '#E6F0EB', '#0F3B2D'], Pet: ['#5B3A86', '#EFE8F7', '#2E1B47'], Both: ['#1E4F6B', '#E6EEF3', '#0F2B3B'] };
const esc = (s) => String(s || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function wrap(text, max) { const words = String(text).split(/\s+/); const lines = []; let l = ''; for (const w of words) { if ((l + ' ' + w).trim().length > max) { if (l.trim()) lines.push(l.trim()); l = w; } else l += ' ' + w; } if (l.trim()) lines.push(l.trim()); return lines.slice(0, 6); }

function frameSvg(scene, i, total, vertical, W, H) {
  const [ink, bg, deep] = PALETTE[vertical] || PALETTE.Both;
  const isHook = i === 0, isEnd = i === total - 1;
  const fs1 = Math.round(W / (isHook ? 11 : 13));
  const lines = wrap(scene.onScreen, Math.round(W / fs1 * 1.6));
  const startY = H * 0.42 - (lines.length * fs1 * 1.2) / 2;
  const back = isHook || isEnd ? deep : bg, fg = isHook || isEnd ? '#FFFFFF' : deep;
  const text = lines.map((l, k) => `<text x="${W / 2}" y="${startY + k * fs1 * 1.2}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${fs1}" fill="${fg}">${esc(l)}</text>`).join('');
  const prog = `<rect x="${W * 0.08}" y="${H * 0.06}" width="${W * 0.84}" height="${H * 0.006}" rx="4" fill="${fg}" opacity="0.2"/><rect x="${W * 0.08}" y="${H * 0.06}" width="${W * 0.84 * (i + 1) / total}" height="${H * 0.006}" rx="4" fill="${isHook || isEnd ? '#FFFFFF' : ink}"/>`;
  const deco = `<circle cx="${W * 0.85}" cy="${H * 0.8}" r="${W * 0.45}" fill="${ink}" opacity="${isHook || isEnd ? 0.35 : 0.08}"/><circle cx="${W * 0.1}" cy="${H * 0.18}" r="${W * 0.18}" fill="${ink}" opacity="${isHook || isEnd ? 0.25 : 0.06}"/>`;
  const sub = scene.sub ? wrap(scene.sub, 34).map((l, k) => `<text x="${W / 2}" y="${H * 0.62 + k * W / 22}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(W / 26)}" fill="${fg}" opacity="0.85">${esc(l)}</text>`).join('') : '';
  const brand = `<text x="${W / 2}" y="${H * 0.93}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${Math.round(W / 24)}" fill="${fg}" opacity="0.9">mywellnesscommunity.com</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${back}"/>${deco}${prog}${text}${sub}${brand}</svg>`;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
    p.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-600)}`)));
  });
}

async function storyboard(c) {
  const sb = await ai.json('video.scenes', `Create a 20–30 second vertical short video storyboard for this MWC page.
Rules: hook in scene 1 (≤ 7 words), 4–6 scenes total, last scene is a call to read the full guide at mywellnesscommunity.com. On-screen text ≤ 12 words per scene. No health claims, no prices, no fake testimonials${c.offerId ? ', include "#ad" in the caption' : ''}.
Reply JSON {"scenes":[{"onScreen": string, "sub": optional short line, "voiceover": string (what a narrator says), "seconds": 3-6}], "caption": string, "hashtags": [string]}.
Page: ${c.title}\n${String(c.body || '').slice(0, 3000)}`, { context: c });
  const scenes = (sb.scenes || []).filter(s => s && s.onScreen).slice(0, 7).map(s => ({ onScreen: String(s.onScreen), sub: s.sub ? String(s.sub) : '', voiceover: String(s.voiceover || s.onScreen), seconds: Math.max(2, Math.min(7, Number(s.seconds) || 4)) }));
  if (scenes.length < 2) throw new Error('Storyboard too short');
  return { scenes, caption: String(sb.caption || c.title), hashtags: (sb.hashtags || []).map(String).slice(0, 8) };
}

/** Render one finished MP4 for a content item; returns the creatives record. */
async function render(contentId) {
  const c = await repo('content').get(contentId);
  if (!c) throw Object.assign(new Error('Content not found'), { status: 404 });
  const { width: W, height: H, ffmpeg } = config.video;
  const sb = await storyboard(c);
  const dir = path.join(MEDIA_DIR, `video-${contentId}`); fs.mkdirSync(dir, { recursive: true });
  const sharp = require('sharp');
  let durations = sb.scenes.map(s => s.seconds);

  // optional voice-over: one track for the whole video; scene lengths stretch to match it
  let audio = null;
  if (tts.configured()) {
    try {
      const mp3 = await tts.synthesize(sb.scenes.map(s => s.voiceover).join(' ... '));
      audio = path.join(dir, 'voice.mp3'); fs.writeFileSync(audio, mp3);
      const est = mp3.length / 4000; // ~32 kbps estimate in seconds; padded below
      const total = durations.reduce((a, b) => a + b, 0);
      if (est > total) durations = durations.map(d => d * est / total);
    } catch (_) { audio = null; }
  }
  const frames = [];
  for (const [i, s] of sb.scenes.entries()) {
    const f = path.join(dir, `scene${i}.png`);
    await sharp(Buffer.from(frameSvg(s, i, sb.scenes.length, c.vertical, W, H))).png().toFile(f);
    frames.push(f);
  }
  const out = path.join(MEDIA_DIR, `${contentId}-short.mp4`);
  const fps = 30; const args = ['-y'];
  frames.forEach((f) => args.push('-i', f));   // one still per scene; zoompan generates the scene's frames
  if (audio) args.push('-i', audio);
  const zoom = frames.map((_, i) => `[${i}:v]scale=${Math.round(W * 1.1 / 2) * 2}:${Math.round(H * 1.1 / 2) * 2},zoompan=z='min(zoom+0.0008,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(durations[i] * fps)}:s=${W}x${H}:fps=${fps},setsar=1[v${i}]`).join(';');
  const concat = frames.map((_, i) => `[v${i}]`).join('') + `concat=n=${frames.length}:v=1:a=0,format=yuv420p[v]`;
  args.push('-filter_complex', `${zoom};${concat}`, '-map', '[v]');
  if (audio) args.push('-map', `${frames.length}:a`, '-c:a', 'aac', '-b:a', '128k', '-shortest');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', out);
  await run(ffmpeg, args);
  fs.rmSync(dir, { recursive: true, force: true });

  let url = `${config.publicBaseUrl}/media/${path.basename(out)}`;
  if (wp.configured()) { try { const m = await wp.uploadMedia(fs.readFileSync(out), path.basename(out), 'video/mp4'); url = m.source_url || url; } catch (_) { /* keep platform URL */ } }
  const caption = `${sb.caption}\n\n${sb.hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' ')}`.trim();
  const existing = await repo('creatives').byExtKey(`content:${contentId}`);
  const patch = { video: { file: out, url, seconds: Math.round(durations.reduce((a, b) => a + b, 0)), voiceOver: !!audio, storyboard: sb.scenes, caption, renderedAt: now() } };
  return existing ? repo('creatives').update(existing.id, patch) : repo('creatives').insert({ extKey: `content:${contentId}`, contentId, kind: 'Banner set', status: 'Ready', vertical: c.vertical, offerId: c.offerId || '', ...patch });
}

module.exports = { render, frameSvg, storyboard };
