// Seeds the affiliate platform register and implementation phases from the brief (idempotent).
const { migrate, close, repo } = require('../src/db');
const seed = require('../data/seed.json');
(async () => {
  await migrate();
  for (const [table, rows] of Object.entries(seed)) {
    const r = repo(table);
    for (const row of rows) { if (!(await r.get(row.id))) await r.insert(row); }
    console.log(`${table}: ${rows.length} checked`);
  }
  await close();
})().catch((e) => { console.error(e); process.exit(1); });
