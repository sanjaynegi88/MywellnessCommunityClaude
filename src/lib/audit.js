const { db, now } = require('../db');
async function audit(actor, action, ref, detail) {
  await db()('audit').insert({ at: now(), actor: typeof actor === 'string' ? actor : actor?.name || 'system', action, ref, detail: typeof detail === 'string' ? detail : JSON.stringify(detail ?? null) });
}
async function recent({ ref, limit = 100 } = {}) {
  const q = db()('audit').orderBy('id', 'desc').limit(limit);
  if (ref) q.where('ref', 'like', `${ref}%`);
  return q;
}
module.exports = { audit, recent };
