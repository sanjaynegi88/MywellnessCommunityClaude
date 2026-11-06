// End-to-end acceptance test — the realistic scenario from section 13 of the brief.
// External platforms are simulated at the HTTP level; AI runs in deterministic mock mode.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DBFILE = path.join(__dirname, '.e2e.sqlite');
for (const f of [DBFILE]) try { fs.unlinkSync(f); } catch (_) {}
Object.assign(process.env, {
  NODE_ENV: 'test', AI_MOCK: '1', DATABASE_URL: DBFILE, AUTOMATION_ENABLED: 'false', CHAT_IDLE_MINUTES: '0',
  AWIN_API_TOKEN: 't', AWIN_PUBLISHER_ID: '123', IMPACT_ACCOUNT_SID: 'sid', IMPACT_AUTH_TOKEN: 'tok',
  WP_BASE_URL: 'https://wp.test', WP_USER: 'u', WP_APP_PASSWORD: 'p',
  MAILERLITE_API_KEY: 'ml', MAILERLITE_WEBHOOK_SECRET: 'whsecret',
  META_PAGE_ID: 'page1', META_PAGE_TOKEN: 'pt', PINTEREST_TOKEN: 'pin', PINTEREST_BOARD_ID: 'b1',
  PUBLIC_BASE_URL: 'http://localhost',
  CLICKBANK_FEED_URL: 'https://cb.test/marketplace_feed_v2.xml.zip',
  TIKTOK_CLIENT_KEY: 'tk', TIKTOK_CLIENT_SECRET: 'ts', TIKTOK_ADLIB_ENABLED: '1', TIKTOK_REFRESH_TOKEN: 'tr', TIKTOK_AD_COUNTRIES: 'DE',
  YOUTUBE_API_KEY: 'yk', YOUTUBE_CLIENT_ID: 'yc', YOUTUBE_CLIENT_SECRET: 'ys', YOUTUBE_REFRESH_TOKEN: 'yr',
  REDDIT_CLIENT_ID: 'rc', REDDIT_CLIENT_SECRET: 'rs', COMMUNITY_KEYWORDS: 'senior dogs',
  AD_KEYWORDS: 'dog joint', VIDEO_WIDTH: '360', VIDEO_HEIGHT: '640',
});
const AdmZip = require('adm-zip');
const cbZip = (() => { const z = new AdmZip(); z.addFile('marketplace_feed_v2.xml', Buffer.from(`<?xml version="1.0"?><Catalog><Category><Name>Health &amp; Fitness</Name><Category><Name>Dietary Supplements</Name>
<Site><Id>VITALJOINT</Id><Title>Vital Joint Health Formula</Title><Description>Joint support</Description><Gravity>42.5</Gravity><Commission>75</Commission><AverageEarningsPerSale>51.2</AverageEarningsPerSale></Site>
<Site><Id>TINYPROD</Id><Title>Tiny Health Product</Title><Gravity>1</Gravity></Site></Category></Category>
<Category><Name>Games</Name><Site><Id>GAMEX</Id><Title>Game Cheats Pro</Title><Gravity>80</Gravity></Site></Category></Catalog>`)); return z.toBuffer(); })();
let wpCatId = 300, wpMenuItem = 900;

/* ---------- simulated external platforms ---------- */
const realFetch = global.fetch;
const calls = [];
let wpPostId = 100;
global.fetch = async (url, init = {}) => {
  const u = new URL(url); const method = init.method || 'GET';
  if (u.hostname === '127.0.0.1') return realFetch(url, init);
  let body = null; if (init.body && typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch (_) { body = Object.fromEntries(new URLSearchParams(init.body)); } }
  calls.push({ host: u.host, path: u.pathname, method, body, query: Object.fromEntries(u.searchParams) });
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.host === 'api.awin.com' && u.pathname.endsWith('/programmes')) {
    if (u.searchParams.get('relationship') === 'joined') return json([]);
    return json([{ id: 501, name: 'PetJoint Co Senior Dog Joint Chews', primarySector: { name: 'Pet supplies' }, primaryRegion: { countryCode: 'GB' }, displayUrl: 'https://petjoint.example' }, { id: 502, name: 'Speedy Car Insurance', primarySector: { name: 'Finance' }, primaryRegion: { countryCode: 'GB' } }]);
  }
  if (u.host === 'cb.test') return new Response(cbZip, { status: 200 });
  if (u.host === 'open.tiktokapis.com') {
    if (u.pathname === '/v2/oauth/token/') return json({ access_token: 'tt_' + body.grant_type, expires_in: 7200 });
    if (u.pathname === '/v2/research/adlib/ad/query/') return json({ data: { ads: [{ ad: { id: 7001, first_shown_date: 20260801, videos: [{ url: 'x' }] }, advertiser: { business_name: 'PawFlex' } }], has_more: false }, error: { code: 'ok' } });
    if (u.pathname === '/v2/post/publish/creator_info/query/') return json({ data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } });
    if (u.pathname === '/v2/post/publish/video/init/') return json({ data: { publish_id: 'v_pub_1' }, error: { code: 'ok' } });
  }
  if (u.host === 'oauth2.googleapis.com') return json({ access_token: 'g_tok', expires_in: 3600 });
  if (u.host === 'www.googleapis.com' && u.pathname === '/upload/youtube/v3/videos') return json({ id: 'yt_1' });
  if (u.host === 'www.googleapis.com' && u.pathname === '/youtube/v3/search') return json({ items: [{ id: { channelId: 'UC1' }, snippet: { channelId: 'UC1' } }] });
  if (u.host === 'www.googleapis.com' && u.pathname === '/youtube/v3/channels') return json({ items: [{ id: 'UC1', snippet: { title: 'Senior Dog Vet Tips', description: 'Vet advice for older dogs' }, statistics: { subscriberCount: '120000', videoCount: '300' } }] });
  if (u.host === 'www.reddit.com') return json({ access_token: 'r_tok', expires_in: 3600 });
  if (u.host === 'oauth.reddit.com') return json({ data: { children: [{ data: { display_name: 'seniordogs', url: '/r/seniordogs/', public_description: 'Older dogs', subscribers: 85000, over18: false } }, { data: { display_name: 'nsfwdogs', url: '/r/x/', subscribers: 5, over18: true } }] } });
  if (u.host === 'api.impact.com') return json({ Campaigns: [{ CampaignId: 9, CampaignName: 'Petco Pet Wellness', AdvertiserName: 'Petco', ContractStatus: 'Pending' }] });
  if (u.host === 'wp.test') {
    if (u.pathname.endsWith('/media')) return json({ id: 77, source_url: 'https://wp.test/uploads/' + (/video/.test(init.headers?.['Content-Type'] || '') ? 'short.mp4' : 'banner.png') });
    if (u.pathname.endsWith('/categories')) return method === 'GET' ? json([]) : json({ id: ++wpCatId, slug: body.slug });
    if (u.pathname.endsWith('/menus') && method === 'POST') return json({ id: 50 });
    if (/\/menus\/\d+$/.test(u.pathname)) return json({ id: 50, locations: body.locations });
    if (u.pathname.endsWith('/menu-items')) return json({ id: ++wpMenuItem });
    const m = u.pathname.match(/\/(posts|pages)(?:\/(\d+))?$/);
    if (m && method === 'POST') { const id = m[2] ? Number(m[2]) : ++wpPostId; return json({ id, link: `https://wp.test/${body?.status === 'publish' ? 'live' : 'draft'}-${id}/`, status: body?.status }); }
  }
  if (u.host === 'connect.mailerlite.com') {
    if (u.pathname === '/api/groups' && method === 'GET') return json({ data: [] });
    if (u.pathname === '/api/groups') return json({ data: { id: 'g_' + body.name.replace(/\W+/g, '_') } });
    if (u.pathname === '/api/subscribers') return json({ data: { id: 's1', email: body.email, status: body.status } });
    if (u.pathname === '/api/campaigns') return json({ data: { id: 'c1' } });
    if (u.pathname.endsWith('/schedule')) return json({ data: { id: 'c1', status: 'ready' } });
  }
  if (u.host === 'graph.facebook.com') return json({ id: 'fbpost_1' });
  if (u.host === 'api.pinterest.com') return json({ id: 'pin_1' });
  return json({ error: 'unexpected call ' + u.host + u.pathname }, 404);
};

const { migrate, repo, close, db } = require('../src/db');
const { createApp } = require('../src/app');
const { createUser } = require('../src/lib/auth');
const jobs = require('../src/jobs');

let base, server, T = {};
async function call(method, p, body, token) {
  const r = await realFetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test.before(async () => {
  await migrate();
  const seed = require('../data/seed.json');
  for (const p of seed.platforms) await repo('platforms').insert(p);
  T.admin = (await createUser('Arijit', 'admin')).token;
  T.approver = (await createUser('Approver', 'approver')).token;
  T.editor = (await createUser('Preeti', 'editor')).token;
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); await close(); try { fs.unlinkSync(DBFILE); } catch (_) {} });

const offerByName = async (re) => (await repo('offers').list()).find(o => re.test(o.name));

test('1. AI discovers relevant offers only and evaluates them', async () => {
  const d = await jobs.runJob('offers.discover');
  assert.equal(d.Awin.added, 1, 'irrelevant car insurance programme is filtered out');
  assert.ok(await offerByName(/PetJoint/));
  assert.equal(await offerByName(/Insurance/), undefined);
  assert.equal(d.ClickBank.added, 1, 'ClickBank feed: health product kept; low-gravity and games products dropped');
  const cb = await offerByName(/Vital Joint/); assert.match(cb.category, /Dietary Supplements/); assert.match(cb.metric, /gravity 42.5/);
  const s = await jobs.runJob('offers.score');
  assert.ok(s.scored >= 2);
  assert.equal((await offerByName(/PetJoint/)).status, 'Shortlisted', 'high demand fit → shortlisted by AI');
  assert.equal((await offerByName(/Petco/)).status, 'Under evaluation');
  const task = (await repo('tasks').list()).find(t => /Apply to/.test(t.title));
  assert.ok(task, 'human task created to apply to the network');
});

test('2. Human approval gateway: automation and editors cannot activate', async () => {
  const o = await offerByName(/PetJoint/);
  const offers = require('../src/services/offers');
  await assert.rejects(offers.transition(o.id, 'Approval pending', { name: 'automation', system: true }), /may not move/);
  let r = await call('POST', `/api/offers/${o.id}/transition`, { to: 'Approval pending' }, T.editor); assert.equal(r.status, 200);
  r = await call('POST', `/api/offers/${o.id}/transition`, { to: 'Approved' }, T.editor); assert.equal(r.status, 403, 'editor cannot approve');
  r = await call('POST', `/api/offers/${o.id}/transition`, { to: 'Approved' }, T.approver); assert.equal(r.status, 200);
  r = await call('POST', `/api/offers/${o.id}/transition`, { to: 'Active' }, T.approver); assert.equal(r.status, 400, 'activation needs explicit confirmations');
  r = await call('POST', `/api/offers/${o.id}/transition`, { to: 'Active', confirmations: { approvedByNetwork: true, trafficRulesChecked: true, trackingLinkInPlace: true }, affiliateLink: 'https://awin1.com/cread.php?awinmid=501', approvalRef: 'Awin email' }, T.approver);
  assert.equal(r.status, 200); assert.equal(r.body.status, 'Active'); assert.equal(r.body.activatedBy, 'Approver');
  r = await call('PATCH', `/api/offers/${o.id}`, { status: 'Active', name: 'PetJoint Co Senior Dog Joint Chews' }, T.editor);
  assert.equal(r.status, 200); // status field is stripped, generic edits cannot bypass the gateway
  const audit = await call('GET', `/api/audit?ref=offer:${o.id}`, null, T.editor);
  assert.ok(audit.body.some(a => /Active/.test(a.action)));
});

test('3. Petco stays blocked (application rejected)', async () => {
  const p = await offerByName(/Petco/);
  for (const to of ['Shortlisted', 'Approval pending']) assert.equal((await call('POST', `/api/offers/${p.id}/transition`, { to }, T.approver)).status, 200);
  const r = await call('POST', `/api/offers/${p.id}/transition`, { to: 'Approved' }, T.approver);
  assert.equal(r.status, 409); assert.match(r.body.error, /rejected/i);
});

test('4. AI generates content for the active offer and sends drafts to WordPress', async () => {
  const a = await jobs.runJob('content.autopilot');
  assert.equal(a.created, 2); assert.equal(a.generated, 2); assert.equal(a.pushed, 2);
  const review = (await repo('content').list()).find(c => c.type === 'Product review');
  assert.equal(review.status, 'In review'); assert.ok(review.wpId);
  assert.ok(calls.some(c => c.host === 'wp.test' && c.body?.status === 'draft'), 'pushed as WordPress draft, never published');
  const inactive = await offerByName(/Petco/);
  const bad = await call('POST', '/api/content', { title: 'x', type: 'Product review' }, T.editor);
  const link = await call('PATCH', `/api/content/${bad.body.id}`, { offerId: inactive.id }, T.editor);
  assert.equal(link.status, 409, 'content cannot be linked to an inactive offer');
});

test('5. Publishing needs an approver and verified facts; then creatives + social are produced', async () => {
  const review = (await repo('content').list()).find(c => c.type === 'Product review' && c.offerId);
  assert.equal((await call('PATCH', `/api/content/${review.id}`, { status: 'Published' }, T.editor)).status, 400);
  assert.equal((await call('POST', `/api/content/${review.id}/approve`, { factsVerified: true }, T.editor)).status, 403);
  assert.equal((await call('POST', `/api/content/${review.id}/approve`, {}, T.approver)).status, 400);
  const r = await call('POST', `/api/content/${review.id}/approve`, { factsVerified: true }, T.approver);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.status, 'Published'); assert.match(r.body.wpUrl, /live-/);
  const cr = await repo('creatives').byExtKey(`content:${review.id}`);
  assert.ok(cr && cr.files.facebook && cr.files.pinterest, 'banner set generated');
  const posts = (await repo('social').list()).filter(p => p.contentId === review.id);
  assert.ok(posts.length >= 4);
  assert.equal(posts.find(p => p.platform === 'Facebook').status, 'Scheduled');
  assert.ok(cr.video?.url && fs.existsSync(cr.video.file), 'finished MP4 rendered');
  const probe = require('child_process').execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', cr.video.file]).toString();
  const meta = JSON.parse(probe); assert.ok(Number(meta.format.duration) >= 5, 'video has the storyboard length'); assert.equal(meta.streams[0].height, 640);
  assert.equal(posts.find(p => p.platform === 'TikTok').status, 'Scheduled', 'TikTok gets the rendered video');
  assert.equal(posts.find(p => p.platform === 'Instagram').status, 'Ready', 'connector without keys → ready + task, never faked');
  for (const p of posts.filter(p => p.status === 'Scheduled')) await repo('social').update(p.id, { date: new Date(Date.now() - 1000).toISOString() });
  const pub = await jobs.runJob('social.publish');
  assert.ok(pub.posted >= 4, JSON.stringify(pub));
  const tk = (await repo('social').list()).find(p => p.platform === 'TikTok' && p.contentId === review.id);
  assert.equal(tk.status, 'Posted'); assert.equal(tk.privacy, 'SELF_ONLY', 'unaudited TikTok app posts privately');
  assert.ok(calls.some(c => c.host === 'open.tiktokapis.com' && c.body?.source_info?.video_url === 'https://wp.test/uploads/short.mp4'));
  assert.ok(calls.some(c => c.path === '/upload/youtube/v3/videos'), 'YouTube Short uploaded');
  assert.match(posts.find(p => p.platform === 'Facebook').link, /utm_source=facebook/);
});

test('6. Visitor chats, gives consent, becomes a segmented customer', async () => {
  let r = await call('POST', '/public/chat', { message: 'My 10 year old lab is getting stiff', page: '/dog-joints/' });
  assert.equal(r.status, 200); const sid = r.body.sessionId; assert.ok(r.body.reply);
  await call('POST', '/public/chat', { sessionId: sid, message: 'We live in the UK' });
  r = await call('POST', '/public/lead', { sessionId: sid, email: 'owner@example.com', name: 'Sam', consent: false });
  assert.equal(r.status, 400, 'no consent → nothing stored');
  r = await call('POST', '/public/lead', { sessionId: sid, email: 'Owner@Example.com', name: 'Sam', consent: true, page: '/dog-joints/' });
  assert.equal(r.status, 200);
  const p = await jobs.runJob('chat.process'); assert.equal(p.processed, 1); assert.ok(p.insights >= 2);
  const c = await repo('contacts').byExtKey('email:owner@example.com');
  assert.equal(c.vertical, 'Pet'); assert.equal(c.country, 'UK');
  assert.ok(c.segments.includes('Pet wellness') && c.segments.includes('Market: UK') && c.segments.includes('Emailable'));
  const consent = await db()('consent_log').where({ email: 'owner@example.com' });
  assert.equal(consent.length, 1); assert.match(consent[0].consent_text, /unsubscribe/);
});

test('7. Eligible subscribers sync to MailerLite; engagement and unsubscribes flow back', async () => {
  await repo('contacts').insert({ extKey: 'email:nope@example.com', email: 'nope@example.com', consentEmail: false, vertical: 'Nutra' });
  const s = await jobs.runJob('email.sync');
  assert.equal(s.synced, 1, 'only the consented contact is synced');
  const sub = calls.filter(c => c.host === 'connect.mailerlite.com' && c.path === '/api/subscribers').pop();
  assert.equal(sub.body.email, 'owner@example.com'); assert.ok(sub.body.groups.some(g => /Pet_wellness/.test(g)));
  const sign = (b) => crypto.createHmac('sha256', 'whsecret').update(b).digest('hex');
  const send = async (obj, sig) => { const b = JSON.stringify(obj); const r = await realFetch(base + '/webhooks/mailerlite', { method: 'POST', headers: { 'Content-Type': 'application/json', Signature: sig ?? sign(b) }, body: b }); return r.status; };
  assert.equal(await send({ type: 'campaign.click', data: { subscriber: { email: 'owner@example.com' } } }, 'forged'), 401);
  const before = (await repo('contacts').byExtKey('email:owner@example.com')).engagement;
  assert.equal(await send({ type: 'campaign.click', data: { subscriber: { email: 'owner@example.com' }, url: 'https://wp.test/live' } }), 200);
  assert.ok((await repo('contacts').byExtKey('email:owner@example.com')).engagement > before);
  // campaign: AI draft → approver sends
  const d = await call('POST', '/api/campaigns/draft', { segment: 'Pet wellness', type: 'Newsletter' }, T.editor);
  assert.equal(d.body.status, 'Draft');
  assert.equal((await call('POST', `/api/campaigns/${d.body.id}/send`, {}, T.editor)).status, 403);
  const sent = await call('POST', `/api/campaigns/${d.body.id}/send`, {}, T.approver);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.status, 'Sending');
  assert.equal(await send({ type: 'subscriber.unsubscribed', data: { subscriber: { email: 'owner@example.com' } } }), 200);
  const c = await repo('contacts').byExtKey('email:owner@example.com');
  assert.equal(c.suppressed, true); assert.equal(c.stage, 'Unsubscribed'); assert.ok(!c.segments.includes('Emailable'));
  const s2 = await jobs.runJob('email.sync'); assert.equal(s2.unsubscribed, 1);
});

test('8. New insights change what happens next (learning cycle acts)', async () => {
  const r = await jobs.runJob('learning.cycle');
  assert.ok(r.recommendations >= 2); assert.equal(r.actions['content.idea'], 1);
  assert.ok((await repo('content').list({ status: 'Idea' })).some(c => /senior dogs/i.test(c.title)), 'learning created a content idea for the autopilot');
  assert.ok(await repo('research').byExtKey('discovery:dog joint'), 'offer search queued from unmet need');
});

test('8b. Ads from TikTok + imported Google/YouTube ads are classified', async () => {
  const r = await jobs.runJob('ads.ingest');
  assert.equal(r.tiktok, 1); assert.equal(r.meta, 'not configured');
  const imp = await call('POST', '/api/ads/import', { rows: [{ advertiser: 'JointPro', platform: 'YouTube', format: 'Video', hook: 'Your knees at 50?', url: 'https://adstransparency.google.com/x' }, { platform: 'no advertiser' }] }, T.editor);
  assert.equal(imp.body.added, 1);
  const all = await repo('ads').list();
  assert.ok(all.every(a => a.status === 'Classified' && a.trigger), 'every ad classified by AI');
});

test('8c. Communities are discovered, scored and fed into research', async () => {
  const r = await jobs.runJob('communities.discover');
  assert.equal(r.sources.Reddit, 1, 'adult community filtered out'); assert.equal(r.sources.YouTube, 1);
  const top = (await repo('communities').list()).sort((a, b) => b.relevance - a.relevance)[0];
  assert.equal(top.status, 'Relevant'); assert.ok(top.audience > 0);
  assert.ok((await repo('research').list()).some(x => x.category === 'Social communities'));
});

test('8d. Site structure: AI proposes, approver applies to WordPress', async () => {
  const p = await call('POST', '/api/structure/propose', {}, T.editor);
  assert.equal(p.status, 200); assert.equal(p.body.newCategories.length, 3);
  assert.equal((await call('POST', `/api/plans/${p.body.planId}/apply`, {}, T.editor)).status, 403);
  const a = await call('POST', `/api/plans/${p.body.planId}/apply`, {}, T.approver);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.categoriesCreated, 3); assert.equal(a.body.menuItems, 4); assert.equal(a.body.postsAssigned, 1); assert.equal(a.body.contentQueued, 2);
  const sub = calls.find(c => c.path.endsWith('/categories') && c.method === 'POST' && c.body.slug === 'joint-health');
  assert.ok(sub.body.parent > 0, 'sub-category nested under its parent');
  assert.ok(calls.some(c => /\/menus\/50$/.test(c.path) && c.body.locations[0] === 'primary'), 'menu assigned to theme location');
  assert.equal((await repo('plans').get(p.body.planId)).status, 'Applied');
});

test('9. Pausing an offer unpublishes its content and blocks its posts', async () => {
  const o = await offerByName(/PetJoint/);
  const r = await call('POST', `/api/offers/${o.id}/transition`, { to: 'Paused', reason: 'programme paused' }, T.editor);
  assert.equal(r.status, 200);
  const linked = (await repo('content').list()).filter(c => c.offerId === o.id);
  assert.ok(linked.some(c => c.publishedAt), 'the review had been published');
  assert.ok(linked.every(c => !['Published', 'Approved'].includes(c.status)));
  assert.ok((await repo('social').list()).filter(p => p.offerId === o.id && p.status !== 'Posted').every(p => p.status === 'Blocked'), 'unposted social posts blocked');
  assert.ok(calls.some(c => c.host === 'wp.test' && c.body?.status === 'draft' && /posts\/\d+$/.test(c.path)), 'WordPress post reverted to draft');
});

test('10. Jobs are logged; widget and console are served; API needs a token', async () => {
  const j = await call('GET', '/api/jobs', null, T.editor);
  assert.ok(j.body.find(x => x.name === 'offers.discover').last.status === 'ok');
  assert.equal((await call('GET', '/api/offers')).status, 401);
  assert.equal((await realFetch(base + '/widget.js')).status, 200);
  assert.equal((await realFetch(base + '/admin/')).status, 200);
  assert.equal((await call('DELETE', `/api/contacts/${(await repo('contacts').list())[0].id}`, null, T.editor)).status, 403, 'only admins delete customer records');
});
