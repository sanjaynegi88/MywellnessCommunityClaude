// Database access: Knex instance + a small repository over the document tables.
const crypto = require('crypto');
const knexLib = require('knex');
const DOC_TABLES = [...require('../migrations/001_init').DOC_TABLES, ...require('../migrations/002_communities_plans').TABLES];

let knex = null;
function db() {
  if (!knex) knex = knexLib(require('../knexfile'));
  return knex;
}
async function migrate() { await db().migrate.latest(); }
async function close() { if (knex) { await knex.destroy(); knex = null; } }

const now = () => new Date().toISOString();
const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

function rowToDoc(r) {
  if (!r) return null;
  let data = {};
  try { data = JSON.parse(r.data); } catch (_) { /* corrupted body: return metadata only */ }
  return { ...data, id: r.id, status: r.status ?? data.status ?? null, createdAt: r.created_at, updatedAt: r.updated_at };
}

function assertTable(t) { if (!DOC_TABLES.includes(t)) throw Object.assign(new Error(`Unknown collection ${t}`), { status: 404 }); }

/** Repository for one document table. */
function repo(table) {
  assertTable(table);
  return {
    table,
    async get(id) { return rowToDoc(await db()(table).where({ id }).first()); },
    async byExtKey(ext) { return rowToDoc(await db()(table).where({ ext_key: ext }).first()); },
    async list({ status, kind, limit = 500, order = 'desc', since } = {}) {
      const q = db()(table).select('*');
      if (status) Array.isArray(status) ? q.whereIn('status', status) : q.where({ status });
      if (kind) q.where({ kind });
      if (since) q.where('updated_at', '>=', since);
      return (await q.orderBy('updated_at', order).limit(limit)).map(rowToDoc);
    },
    async count(where = {}) { const r = await db()(table).where(where).count({ n: '*' }).first(); return Number(r.n); },
    async insert(doc) {
      const id = doc.id || newId(); const t = now();
      const body = { ...doc, id, createdAt: doc.createdAt || t, updatedAt: t };
      await db()(table).insert({ id, status: body.status ?? null, kind: body.kind ?? body.type ?? null, ext_key: body.extKey ?? null, data: JSON.stringify(body), created_at: body.createdAt, updated_at: t });
      return body;
    },
    async update(id, patch) {
      const cur = await this.get(id);
      if (!cur) throw Object.assign(new Error(`${table}/${id} not found`), { status: 404 });
      const body = { ...cur, ...patch, id, updatedAt: now() };
      await db()(table).where({ id }).update({ status: body.status ?? null, kind: body.kind ?? body.type ?? null, ext_key: body.extKey ?? null, data: JSON.stringify(body), updated_at: body.updatedAt });
      return body;
    },
    async upsertByExtKey(extKey, doc) {
      const cur = await this.byExtKey(extKey);
      return cur ? this.update(cur.id, { ...doc, extKey, status: cur.status }) : this.insert({ ...doc, extKey });
    },
    async remove(id) { await db()(table).where({ id }).delete(); },
  };
}

module.exports = { db, migrate, close, repo, now, newId, DOC_TABLES };
