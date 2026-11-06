// WordPress REST API publishing. Auth: Application Password (Users → Profile → Application Passwords).
const { request } = require('../lib/http');
const config = require('../config');
const w = config.connectors.wordpress;

const auth = () => 'Basic ' + Buffer.from(`${w.user}:${w.appPassword}`).toString('base64');
const api = (p) => `${w.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/${p}`;

module.exports = {
  configured: () => !!(w.baseUrl && w.user && w.appPassword),
  /** type: 'posts' | 'pages'. status defaults to 'draft' — automation never publishes offer content. */
  async create(type, { title, html, status = 'draft', excerpt, slug, categories, tags }) {
    return request(api(type), { method: 'POST', headers: { Authorization: auth() }, json: { title, content: html, status, excerpt, slug, categories, tags } });
  },
  async update(type, id, fields) { return request(api(`${type}/${id}`), { method: 'POST', headers: { Authorization: auth() }, json: fields }); },
  async get(type, id) { return request(api(`${type}/${id}`), { headers: { Authorization: auth() }, query: { context: 'edit' } }); },
  async uploadMedia(buffer, filename, mime = 'image/png') {
    return request(api('media'), { method: 'POST', headers: { Authorization: auth(), 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${filename}"` }, body: buffer });
  },
  /* ---- Site structure: categories & navigation menus ----
     Menus (/wp/v2/menus, /wp/v2/menu-items, WordPress ≥ 5.9) need the edit_theme_options capability,
     so the API user must be an Administrator for menu changes. */
  async categories() { return request(api('categories'), { headers: { Authorization: auth() }, query: { per_page: 100, _fields: 'id,name,slug,parent,description,count' } }); },
  async createCategory({ name, slug, parent = 0, description = '' }) { return request(api('categories'), { method: 'POST', headers: { Authorization: auth() }, json: { name, slug, parent, description } }); },
  async setPostCategories(type, id, categoryIds) { return request(api(`${type}/${id}`), { method: 'POST', headers: { Authorization: auth() }, json: { categories: categoryIds } }); },
  async menus() { return request(api('menus'), { headers: { Authorization: auth() }, query: { per_page: 100, context: 'edit' } }); },
  async createMenu(name, locations = []) { return request(api('menus'), { method: 'POST', headers: { Authorization: auth() }, json: { name, locations } }); },
  async assignMenuLocation(menuId, locations) { return request(api(`menus/${menuId}`), { method: 'POST', headers: { Authorization: auth() }, json: { locations } }); },
  async createMenuItem(item) { return request(api('menu-items'), { method: 'POST', headers: { Authorization: auth() }, json: { status: 'publish', ...item } }); },
  async listPublished(type = 'posts', page = 1) {
    return request(api(type), { headers: { Authorization: auth() }, query: { per_page: 100, page, status: 'publish', _fields: 'id,link,title,modified,type' } });
  },
};
