// Website structure intelligence (brief Stage 6A): consumer-friendly need-based navigation,
// technical product classifications, category landing pages, internal linking and homepage sections.
// AI proposes a plan from research, offers, content, chatbot needs, search data and competitor patterns.
// An approver reviews the diff and applies it: categories are created in WordPress, published posts are
// assigned, a navigation menu is built (and optionally assigned to the theme location), and homepage and
// category-page copy is queued as content (through the normal draft → review → publish flow).
const { repo, now } = require('../db');
const ai = require('../lib/ai');
const config = require('../config');
const wp = require('../connectors/wordpress');
const { audit } = require('../lib/audit');
const tasks = require('./tasks');

const plans = repo('plans');
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);

async function currentStructure() {
  if (!wp.configured()) return { categories: [], menus: [] };
  const [cats, menus] = await Promise.all([wp.categories().catch(() => []), wp.menus().catch(() => [])]);
  return { categories: cats.map(c => ({ id: c.id, name: c.name, slug: c.slug, parent: c.parent, count: c.count })), menus: menus.map(m => ({ id: m.id, name: m.name, locations: m.locations })) };
}

async function propose() {
  const [research, offers, content, chats, competitors, metrics, current] = await Promise.all([
    repo('research').list({ limit: 60 }), repo('offers').list({ status: ['Active', 'Approved', 'Shortlisted'], limit: 100 }),
    repo('content').list({ limit: 300 }), repo('chats').list({ status: 'Processed', limit: 200 }),
    repo('competitors').list({ limit: 30 }), repo('metrics').list({ limit: 3000 }), currentStructure(),
  ]);
  const needs = {}; chats.forEach(c => (c.needs || []).concat(c.interests || []).forEach(n => { needs[n] = (needs[n] || 0) + 1; }));
  const queries = metrics.filter(m => m.source === 'Search Console').sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, 40).map(m => m.query);
  const plan = await ai.json('structure.propose', `Design the information architecture for mywellnesscommunity.com (affiliate site: human wellness/supplements and pet wellness/pet food; USA, UK, Europe).
Requirements: (1) consumer-friendly NEED-based navigation (e.g. "Sleep & relaxation", "Senior dog joints"), (2) technical product classifications (e.g. "Magnesium", "Probiotics", "Dog food"), (3) category landing pages, (4) homepage sections, (5) internal linking. Use only needs supported by the data. Max 2 levels. Keep existing categories where they fit (reuse their slugs).
Reply JSON {"categories":[{"name","slug","parent": parent slug or "","kind":"need"|"technical","description"}],
 "menu":[{"title","categorySlug" or "url","children":[{"title","categorySlug" or "url"}]}],
 "assignments":[{"contentTitle","categorySlugs":[..]}],
 "homepageSections":[{"title","purpose"}],
 "categoryPages":[{"categorySlug","title","purpose"}],
 "internalLinks":[{"from":"content title","to":"content title","anchor"}],
 "rationale": string}.
Current WordPress structure: ${JSON.stringify(current)}
Customer needs (chatbot): ${JSON.stringify(needs)}
Top search queries: ${JSON.stringify(queries)}
Research: ${JSON.stringify(research.slice(0, 30).map(r => ({ title: r.title, category: r.category, vertical: r.vertical })))}
Offers: ${JSON.stringify(offers.map(o => ({ name: o.name, category: o.category, vertical: o.vertical, status: o.status })))}
Content: ${JSON.stringify(content.slice(0, 120).map(c => ({ title: c.title, type: c.type, vertical: c.vertical, status: c.status })))}
Competitor navigation patterns: ${JSON.stringify(competitors.map(c => ({ name: c.name, nav: c.lastCrawl?.nav?.slice(0, 20), features: c.features })))}`, { maxTokens: 6000 });
  for (const c of plan.categories || []) c.slug = c.slug ? slugify(c.slug) : slugify(c.name);
  const existing = new Set(current.categories.map(c => c.slug));
  const diff = { newCategories: (plan.categories || []).filter(c => !existing.has(c.slug)).map(c => c.name), keptCategories: (plan.categories || []).filter(c => existing.has(c.slug)).map(c => c.name), menuItems: (plan.menu || []).reduce((n, m) => n + 1 + (m.children || []).length, 0), assignments: (plan.assignments || []).length };
  for (const old of await plans.list({ status: 'Proposed', limit: 20 })) await plans.update(old.id, { status: 'Superseded' });
  const doc = await plans.insert({ kind: 'Site structure', status: 'Proposed', plan, diff, basedOn: { needs: Object.keys(needs).length, queries: queries.length, research: research.length }, proposedAt: now() });
  await tasks.add(`structure:${doc.id}`, { title: 'Review proposed site structure', detail: `${diff.newCategories.length} new categories, ${diff.menuItems} menu items, ${diff.assignments} post assignments.`, module: 'structure', ref: `plan:${doc.id}`, role: 'approver' });
  return { planId: doc.id, ...diff };
}

async function apply(planId, user, { assignMenuLocation = true } = {}) {
  if (!['approver', 'admin'].includes(user.role)) throw Object.assign(new Error('Only an approver can change the site structure'), { status: 403 });
  const p = await plans.get(planId);
  if (!p || p.status !== 'Proposed') throw Object.assign(new Error('Plan not found or not awaiting approval'), { status: 409 });
  const plan = p.plan; const result = { categoriesCreated: 0, postsAssigned: 0, menuItems: 0, contentQueued: 0, menuId: null, warnings: [] };
  const catIds = {};
  if (wp.configured()) {
    const existing = await wp.categories();
    existing.forEach(c => { catIds[c.slug] = c.id; });
    const ordered = [...(plan.categories || [])].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));
    for (const c of ordered) {
      if (catIds[c.slug]) continue;
      const created = await wp.createCategory({ name: c.name, slug: c.slug, parent: c.parent ? (catIds[slugify(c.parent)] || 0) : 0, description: c.description || '' });
      catIds[c.slug] = created.id; result.categoriesCreated++;
    }
    const content = await repo('content').list({ status: 'Published', limit: 2000 });
    for (const a of plan.assignments || []) {
      const c = content.find(x => x.title.toLowerCase() === String(a.contentTitle || '').toLowerCase());
      const ids = (a.categorySlugs || []).map(s => catIds[slugify(s)]).filter(Boolean);
      if (!c?.wpId || !ids.length) continue;
      await wp.setPostCategories(c.wpType || 'posts', c.wpId, ids); result.postsAssigned++;
    }
    try {
      const menu = await wp.createMenu(`MWC navigation ${now().slice(0, 10)}`);
      result.menuId = menu.id;
      const base = config.connectors.wordpress.baseUrl.replace(/\/$/, '');
      const add = async (item, parent = 0, order = 1) => {
        const slug = item.categorySlug ? slugify(item.categorySlug) : null;
        const body = slug && catIds[slug] ? { title: item.title, type: 'taxonomy', object: 'category', object_id: catIds[slug], menus: menu.id, parent, menu_order: order } : { title: item.title, type: 'custom', url: item.url && /^https?:/.test(item.url) ? item.url : `${base}${item.url || '/'}`, menus: menu.id, parent, menu_order: order };
        const r = await wp.createMenuItem(body); result.menuItems++; return r.id;
      };
      let order = 1;
      for (const m of plan.menu || []) { const pid = await add(m, 0, order++); for (const ch of m.children || []) await add(ch, pid, order++); }
      if (assignMenuLocation && config.connectors.wordpress.menuLocation) await wp.assignMenuLocation(menu.id, [config.connectors.wordpress.menuLocation]);
    } catch (e) { result.warnings.push(`Menu not changed: ${e.message} (the WordPress API user needs the Administrator role for menus)`); }
  } else result.warnings.push('WordPress not connected: plan approved, apply categories/menu manually');
  // homepage + category landing copy go through the normal content workflow
  const existingTitles = new Set((await repo('content').list({ limit: 3000 })).map(c => c.title.toLowerCase()));
  for (const s of plan.homepageSections || []) if (!existingTitles.has(`homepage: ${s.title}`.toLowerCase())) { await repo('content').insert({ title: `Homepage: ${s.title}`, type: 'Homepage section', vertical: 'Both', status: 'Idea', body: `Brief: ${s.purpose}`, source: `plan:${planId}` }); result.contentQueued++; }
  for (const s of plan.categoryPages || []) if (!existingTitles.has(String(s.title).toLowerCase())) { await repo('content').insert({ title: s.title, type: 'Category page', vertical: 'Both', status: 'Idea', keywords: s.categorySlug, body: `Brief: ${s.purpose}`, wpCategorySlug: slugify(s.categorySlug || ''), source: `plan:${planId}` }); result.contentQueued++; }
  await plans.update(planId, { status: 'Applied', appliedBy: user.name, appliedAt: now(), result });
  await audit(user, 'site structure applied', `plan:${planId}`, result);
  await tasks.done(`structure:${planId}`);
  return result;
}

async function reject(planId, user, reason = '') {
  await plans.update(planId, { status: 'Rejected', rejectedBy: user.name, reason });
  await tasks.done(`structure:${planId}`);
  await audit(user, 'site structure rejected', `plan:${planId}`, { reason });
}

module.exports = { propose, apply, reject, slugify };
