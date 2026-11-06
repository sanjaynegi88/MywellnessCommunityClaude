// Automation worker: runs the scheduled 360° loop (see src/jobs.js).
const log = require('./logger');
const { migrate } = require('./db');
(async () => { await migrate(); require('./jobs').start(); })().catch((e) => { log.fatal(e); process.exit(1); });
process.on('unhandledRejection', (e) => log.error({ err: String(e) }, 'unhandled rejection'));
