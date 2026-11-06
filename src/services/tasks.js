// Human work queue. Automation creates tasks wherever a person must act
// (apply to a programme, verify facts, upload to a platform without an API, approve a campaign).
const { repo } = require('../db');
const tasks = repo('tasks');

/** Adds a task once per key; re-opening is avoided while an open task with the key exists. */
async function add(key, { title, detail = '', module = '', ref = '', priority = 'Medium', role = 'editor' }) {
  const existing = await tasks.byExtKey(key);
  if (existing && existing.status === 'Open') return existing;
  if (existing) return tasks.update(existing.id, { title, detail, module, ref, priority, role, status: 'Open' });
  return tasks.insert({ extKey: key, title, detail, module, ref, priority, role, status: 'Open' });
}
async function done(key) { const t = await tasks.byExtKey(key); if (t && t.status === 'Open') await tasks.update(t.id, { status: 'Done' }); }
module.exports = { add, done };
