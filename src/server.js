const config = require('./config');
const log = require('./logger');
const { migrate } = require('./db');
const { createApp } = require('./app');

(async () => {
  await migrate();
  createApp().listen(config.port, () => log.info({ port: config.port }, 'MWC 360 API listening'));
  // Single-process mode (small deployments): run the scheduler inside the API process.
  if (process.env.RUN_SCHEDULER === 'true') require('./jobs').start();
})().catch((e) => { log.fatal(e); process.exit(1); });
