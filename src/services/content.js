// Stage 6: complete website content intelligence & automation.
// AI drafts → rule + AI compliance checks → WordPress DRAFT → human approval → published.
// Offer-specific content requires an Active offer at every step (generate, approve, stay live).
const { repo } = require('../db');
const ai = require('../lib/ai');
const config = require('../config');
const compliance = require('../lib/compliance');
const { audit } = require('../lib/audit');
const wp = require('../connectors/wordpress');
const tasks = require('./tasks');
const offersSvc = require('./offers');

const content = repo('content');
const offers = repo('offers');

const TYPES = ['Homepage section', 'Category page', 'Product description', 'Product review', 'Comparison', 'Buying guide', 'Brand page', 'Educational blog', 'FAQ', 'Landing page', 'Lead magnet', 'Banner/graphic brief', 'Infographic brief', 'Video script', 'Downloadable resource'];
const WP_TYPE = (t) => (['Homepage section', 'Category page', 'Landing page', 'Lead magnet', 'Brand page', 'Downloadable resource'].includes(t) ? 'pages' : 'posts');

function toHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return md.split(/\n{2,}/).map(block => {
    const b = block.trim(); if (!b) return '';
    if (/^### /.test(b)) return `<h3>${esc(b.slice(4))}</h3>`;
    if (/^## /.test(b)) return `<h2>${esc(b.slice(3))}</h2>`;
    if (/^# /.test(b)) return `<h2>${esc(b.slice(2))}</h2>`;
    if (/^[-*] /m.test(b)) return '<ul>' + b.split('\n').map(l => `<li>${esc(l.replace(/^[-*]\s+/, ''))}</li>`).join('') + '</ul>';
    return `<p>${esc(b).replace(/\n/g, '<br>')}</p>`;
  }).join('\n').replace(/\[LINK: ([^\]]+)\]/g, '<!-- internal link: $1 -->');
}

async function generate(id, actor = { name: 'automation' }) {
  const c = await content.get(id);
  if (!c) throw Object.assign(new Error('Content not found'), { status: 404 });
  const offer = c.offerId ? await offers.get(c.offerId) : null;
  if (c.offerId && !offersSvc.isPromotable(offer)) throw Object.assign(new Error('The linked offer is not Active. Offer-specific content can only be generated for Active offers.'), { status: 409 });
  const [research, insights, published] = await Promise.all([repo('research').list({ limit: 30 }), repo('insights').list({ limit: 30 }), content.list({ status: 'Published', limit: 60 })]);
  const rel = research.filter(r => !c.vertical || r.vertical === c.vertical || r.vertical === 'Both').slice(0, 10).map(r => `- ${r.title}: ${String(r.finding || '').slice(0, 300)}`).join('\n');
  const needs = insights.filter(i => i.status !== 'Dismissed').slice(0, 12).map(i => `- ${i.text}`).join('\n');
  const links = published.slice(0, 30).map(p => `- ${p.title} (${p.wpUrl || ''})`).join('\n');
  const prompt = `Write a ${c.type} for the MWC website.
Title: ${c.title}
Vertical: ${c.vertical || 'Both'}
Target keywords: ${c.keywords || '(choose sensible ones)'}
${offer ? `Promoted ACTIVE offer: ${offer.name} (network ${offer.network}; category ${offer.category}; markets ${offer.markets}). Verified facts on record: ${offer.verifiedFacts || 'none — mark every product fact [VERIFY]'}. Start with an affiliate disclosure line. Link text for the offer: [AFFILIATE LINK].` : 'Informational content: do not promote specific products.'}
Market research:\n${rel || '- none yet'}
Customer questions & needs (chatbot, email, search):\n${needs || '- none yet'}
Existing MWC pages for internal links:\n${links || '- none yet'}
Format: Markdown with ## headings, short paragraphs, a FAQ section where it fits, internal-link suggestions written as [LINK: page title], and a final line "Meta description: …". For graphic/infographic/video types write the production brief (concept, layout, on-screen copy, specs per platform) instead of prose.`;
  const body = await ai.complete('content.generate', prompt, { maxTokens: 6000, context: c });
  const rules = compliance.check(body, { promotesOffer: !!offer });
  const review = await ai.complete('content.compliance', `Review this MWC ${c.type} before publishing. List concisely: (1) health/medical claims not allowed or needing evidence, (2) facts, prices or ratings that must be verified, (3) missing affiliate disclosure, (4) fabricated testimonials or reviews, (5) safe rewrites.\n---\n${body.slice(0, 20000)}`, { tier: 'quick' });
  const updated = await content.update(id, { body, html: toHtml(body), compliance: { ...rules, aiReview: review, checkedAt: new Date().toISOString() }, factsVerified: false, status: 'In review', generatedAt: new Date().toISOString() });
  await audit(actor, 'content generated', `content:${id}`, { flags: rules.flags });
  await tasks.add(`review:${id}`, { title: `Review & verify "${c.title}"`, detail: `${rules.flags.length ? 'Compliance flags: ' + rules.flags.join(', ') + '. ' : ''}${rules.verifyCount} item(s) marked [VERIFY]. Check every product fact, price and claim, then approve.`, module: 'content', ref: `content:${id}`, priority: rules.flags.length ? 'High' : 'Medium', role: 'approver' });
  return updated;
}

/** Sends the draft to WordPress as a draft post/page so editors can see it in context. */
async function pushDraft(id) {
  const c = await content.get(id);
  if (!wp.configured() || !c?.html) return c;
  if (c.wpId && c.publishedAt) return c;   // a refresh of a live page: keep the live version until the new draft is approved
  const html = await finalHtml(c);
  if (c.wpId) { await wp.update(WP_TYPE(c.type), c.wpId, { title: c.title, content: html }); return c; }
  const r = await wp.create(WP_TYPE(c.type), { title: c.title, html, status: 'draft' });
  return content.update(id, { wpId: r.id, wpType: WP_TYPE(c.type), wpEditUrl: `${config.connectors.wordpress.baseUrl}/wp-admin/post.php?post=${r.id}&action=edit` });
}
async function finalHtml(c) {
  let html = c.html || toHtml(c.body || '');
  // internal linking: AI suggestions [LINK: title] become real links to published MWC pages
  const live = (await content.list({ status: 'Published', limit: 2000 })).filter(p => p.wpUrl && p.id !== c.id);
  html = html.replace(/<!-- internal link: ([^>]+?) -->/g, (m, title) => {
    const t = title.trim().toLowerCase();
    const hit = live.find(p => p.title.toLowerCase() === t) || live.find(p => p.title.toLowerCase().includes(t) || t.includes(p.title.toLowerCase()));
    return hit ? `<a href="${hit.wpUrl}">${hit.title.replace(/</g, '&lt;')}</a>` : '';
  });
  if (c.offerId) { const o = await offers.get(c.offerId); if (o?.affiliateLink) html = html.replace(/\[AFFILIATE LINK\]/g, `<a href="${o.affiliateLink}" rel="sponsored nofollow" data-offer-id="${o.id}" data-network="${o.network}">Check current price</a>`); }
  return html;
}

/** Human approval → publish. Enforces: approver role, facts verified, active offer, clean or overridden compliance. */
async function approveAndPublish(id, user, { factsVerified, complianceOverrideNote } = {}) {
  if (!['approver', 'admin'].includes(user.role)) throw Object.assign(new Error('Only an approver can publish'), { status: 403 });
  const c = await content.get(id);
  if (!c) throw Object.assign(new Error('Content not found'), { status: 404 });
  if (!factsVerified) throw Object.assign(new Error('Confirm that product facts, prices, ratings and claims were verified by a person'), { status: 400 });
  if (c.offerId && !offersSvc.isPromotable(await offers.get(c.offerId))) throw Object.assign(new Error('The linked offer is not Active'), { status: 409 });
  const flags = compliance.check(c.body, { promotesOffer: !!c.offerId }).flags;
  if (flags.length && !complianceOverrideNote) throw Object.assign(new Error(`Compliance flags must be fixed or overridden with a note: ${flags.join(', ')}`), { status: 409 });
  let patch = { factsVerified: true, verifiedBy: user.name, verifiedAt: new Date().toISOString(), complianceOverrideNote: complianceOverrideNote || '', status: 'Published', publishedAt: new Date().toISOString() };
  if (wp.configured()) {
    const html = await finalHtml(c); const type = c.wpType || WP_TYPE(c.type);
    const r = c.wpId ? await wp.update(type, c.wpId, { title: c.title, content: html, status: 'publish' }) : await wp.create(type, { title: c.title, html, status: 'publish' });
    patch = { ...patch, wpId: r.id, wpType: type, wpUrl: r.link || c.wpUrl };
    if (c.wpCategorySlug && type === 'posts') { try { const cat = (await wp.categories()).find(x => x.slug === c.wpCategorySlug); if (cat) await wp.setPostCategories(type, r.id, [cat.id]); } catch (_) { /* category optional */ } }
  } else patch.status = 'Approved';    // no WordPress connection yet: approved, awaiting manual publishing
  const updated = await content.update(id, patch);
  await audit(user, `content ${patch.status.toLowerCase()}`, `content:${id}`, { wpUrl: patch.wpUrl, flags, override: complianceOverrideNote });
  await tasks.done(`review:${id}`);
  if (patch.status === 'Published') {          // downstream automation: creatives + social
    await require('./creatives').forContent(id).catch(() => null);
    await require('./video').render(id).catch((e) => require('../logger').warn({ err: e.message }, 'video render failed'));
    await require('./social').repurpose(id).catch(() => null);
  }
  return updated;
}

/** Called whenever an offer leaves Active: unpublish its content so inactive offers are never promoted. */
async function onOfferDeactivated(offerId, actor) {
  const linked = (await content.list({ limit: 1000 })).filter(c => c.offerId === offerId && ['Published', 'Approved', 'In review'].includes(c.status));
  for (const c of linked) {
    if (c.wpId && wp.configured()) await wp.update(c.wpType || WP_TYPE(c.type), c.wpId, { status: 'draft' }).catch(() => null);
    await content.update(c.id, { status: 'Needs update', hold: `Offer no longer active (${new Date().toISOString().slice(0, 10)}) — unpublished` });
    await audit(actor, 'content unpublished (offer inactive)', `content:${c.id}`, { offerId });
  }
  for (const p of (await repo('social').list({ limit: 1000 })).filter(p => p.offerId === offerId && ['Planned', 'Ready', 'Scheduled'].includes(p.status))) await repo('social').update(p.id, { status: 'Blocked', hold: 'Offer no longer active' });
  return linked.length;
}

/** Daily autopilot: content for new active offers + AI/learning-generated ideas, then drafts to WordPress. */
async function autopilot({ max = 5 } = {}) {
  const out = { created: 0, generated: 0, pushed: 0, errors: [] };
  const all = await content.list({ limit: 2000 });
  for (const o of await offers.list({ status: 'Active', limit: 200 })) {
    for (const type of ['Product review', 'Buying guide']) {
      if (all.some(c => c.offerId === o.id && c.type === type)) continue;
      const c = await content.insert({ title: type === 'Product review' ? `${o.name} review` : `Best ${o.category || o.name}: buying guide`, type, vertical: o.vertical, offerId: o.id, keywords: o.category || '', status: 'Idea', source: 'autopilot:new-active-offer' });
      all.push(c); out.created++;
    }
  }
  const ideas = (await content.list({ status: 'Idea', limit: 50 })).slice(0, max);
  for (const c of ideas) {
    try { await generate(c.id); out.generated++; const p = await pushDraft(c.id); if (p?.wpId) out.pushed++; }
    catch (e) { out.errors.push(`${c.title}: ${e.message}`); }
  }
  // informational content may auto-publish only when explicitly enabled AND compliance is clean
  if (config.automation.autoPublishInformational) {
    for (const c of await content.list({ status: 'In review', limit: 20 })) {
      if (c.offerId || !c.compliance?.clean || c.compliance.verifyCount) continue;
      await approveAndPublish(c.id, { name: 'automation (informational auto-publish)', role: 'approver' }, { factsVerified: true }).catch(e => out.errors.push(e.message));
    }
  }
  return out;
}

/** Weekly optimisation: flag pages whose traffic dropped or that rank on page 2 with demand. */
async function optimise() {
  const metrics = await repo('metrics').list({ limit: 5000 });
  const published = await content.list({ status: 'Published', limit: 1000 });
  const path = (u) => { try { return new URL(u).pathname; } catch (_) { return u; } };
  const recent = Date.now() - 14 * 864e5, prior = Date.now() - 28 * 864e5;
  let flagged = 0;
  for (const c of published) {
    if (!c.wpUrl) continue; const p = path(c.wpUrl);
    const rows = metrics.filter(m => m.page === p && m.source === 'GA4');
    const sum = (from, to) => rows.filter(m => { const t = Date.parse(m.date); return t >= from && t < to; }).reduce((a, m) => a + (Number(m.sessions) || 0), 0);
    const now = sum(recent, Date.now()), before = sum(prior, recent);
    const gsc = metrics.filter(m => m.source === 'Search Console' && m.page && m.page.endsWith(p));
    const page2 = gsc.filter(m => m.position > 10 && m.impressions > 100);
    if ((before > 50 && now < before * 0.7) || page2.length) {
      await content.update(c.id, { status: 'Needs update', optimisationReason: before > 50 && now < before * 0.7 ? `Sessions fell ${before}→${now} (14-day windows)` : `Ranks on page 2 for: ${page2.slice(0, 5).map(m => m.query).join(', ')}` });
      await tasks.add(`refresh:${c.id}`, { title: `Refresh "${c.title}"`, detail: 'Flagged by the optimisation job. Regenerate or edit, then re-approve.', module: 'content', ref: `content:${c.id}` });
      flagged++;
    }
  }
  // regenerate drafts for flagged items (they go back through review)
  for (const c of (await content.list({ status: 'Needs update', limit: 5 }))) { if (c.hold) continue; await content.update(c.id, { status: 'Idea' }); }
  return { flagged };
}

module.exports = { TYPES, generate, pushDraft, approveAndPublish, onOfferDeactivated, autopilot, optimise, toHtml };
