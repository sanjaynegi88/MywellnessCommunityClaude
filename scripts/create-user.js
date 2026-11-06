// Usage: node scripts/create-user.js "Arijit" admin
//        roles: admin | approver | editor | viewer
const { migrate, close } = require('../src/db');
const { createUser } = require('../src/lib/auth');
(async () => {
  const [name = 'Admin', role = 'admin'] = process.argv.slice(2);
  await migrate();
  const u = await createUser(name, role);
  console.log(`\nCreated ${u.role} "${u.name}".\nAPI token (shown once — store it in your password manager):\n\n  ${u.token}\n`);
  await close();
})().catch((e) => { console.error(e.message); process.exit(1); });
