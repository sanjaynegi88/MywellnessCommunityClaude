// The automation schedule: the 360° loop running on its own.
// Every run is recorded in job_runs (visible in the console) and can be triggered manually.
const cron = require('node-cron');
const { db, now } = require('./db');
const config = require('./config');
const log = require('./logger');

const offers = () => require('./services/offers');
const intel = () => require('./services/intelligence');
const content = () => require('./services/content');
const social = () => require('./services/social');
const chatbot = () => require('./services/chatbot');
const crm = () => require('./services/crm');
const email = () => require('./services/email');
const analytics = () => require('./services/analytics');
const learning = () => require('./services/learning');
const communitiesSvc = () => require('./services/communities');
const structure = () => require('./services/structure');

// Times are in config.automation.timezone (default Europe/London). Order follows the loop.
const JOBS = {
  'research.refresh':    { cron: '0 5 * * 1',     stage: 'Secondary research',     run: () => intel().refreshResearch() },
  'ads.ingest':          { cron: '30 5 * * *',    stage: 'Advertising intelligence', run: () => intel().ingestAds() },
  'ads.patterns':        { cron: '0 6 * * 1',     stage: 'Advertising intelligence', run: () => intel().adPatterns() },
  'competitors.crawl':   { cron: '0 4 * * 1',     stage: 'Competitor analysis',    run: () => intel().crawlCompetitors() },
  'communities.discover':{ cron: '30 4 * * 2',    stage: 'Social community research', run: () => communitiesSvc().discover() },
  'structure.propose':   { cron: '0 9 1 * *',     stage: 'Website structure',      run: () => structure().propose() },
  'offers.discover':     { cron: '15 6 * * *',    stage: 'Offer discovery',        run: () => offers().discover() },
  'offers.score':        { cron: '45 6 * * *',    stage: 'Offer evaluation',       run: () => offers().scoreNew() },
  'offers.performance':  { cron: '0 7 * * *',     stage: 'Analytics',              run: () => offers().performance() },
  'analytics.pull':      { cron: '20 7 * * *',    stage: 'Analytics',              run: () => analytics().pull() },
  'content.autopilot':   { cron: '0 8 * * *',     stage: 'Content generation',     run: () => content().autopilot() },
  'content.optimise':    { cron: '0 9 * * 1',     stage: 'Content optimisation',   run: () => content().optimise() },
  'social.publish':      { cron: '*/15 * * * *',  stage: 'Social promotion',       run: () => social().publishDue() },
  'social.insights':     { cron: '10 10 * * *',   stage: 'Social promotion',       run: () => social().insights() },
  'chat.process':        { cron: '*/10 * * * *',  stage: 'Chatbot research',       run: () => chatbot().processIdle() },
  'crm.recompute':       { cron: '5 * * * *',     stage: 'Segmentation',           run: () => crm().recomputeAll() },
  'email.sync':          { cron: '35 * * * *',    stage: 'Email marketing',        run: () => email().sync() },
  'email.stats':         { cron: '50 11 * * *',   stage: 'Email marketing',        run: () => email().stats() },
  'email.newsletter':    { cron: '0 10 * * 4',    stage: 'Email marketing',        run: async () => ({ nutra: (await email().draft({ segment: 'Nutra wellness', type: 'Newsletter' })).id, pet: (await email().draft({ segment: 'Pet wellness', type: 'Newsletter' })).id }) },
  'learning.cycle':      { cron: '30 12 * * *',   stage: 'Updated intelligence',   run: () => learning().cycle() },
};

const running = new Set();
async function runJob(name) {
  const job = JOBS[name];
  if (!job) throw Object.assign(new Error(`Unknown job ${name}`), { status: 404 });
  if (running.has(name)) return { skipped: 'already running' };
  running.add(name);
  const [id] = await db()('job_runs').insert({ job: name, started_at: now(), status: 'running' }).returning('id');
  const runId = typeof id === 'object' ? id.id : id;
  try {
    const summary = await job.run();
    await db()('job_runs').where({ id: runId }).update({ finished_at: now(), status: 'ok', summary: JSON.stringify(summary ?? null).slice(0, 4000) });
    log.info({ job: name, summary }, 'job ok');
    return summary;
  } catch (e) {
    await db()('job_runs').where({ id: runId }).update({ finished_at: now(), status: 'error', error: String(e.stack || e.message).slice(0, 4000) });
    log.error({ job: name, err: e.message }, 'job failed');
    throw e;
  } finally { running.delete(name); }
}

function start() {
  if (!config.automation.enabled) { log.warn('AUTOMATION_ENABLED=false — scheduler not started'); return; }
  for (const [name, j] of Object.entries(JOBS)) cron.schedule(j.cron, () => runJob(name).catch(() => null), { timezone: config.automation.timezone });
  log.info({ jobs: Object.keys(JOBS).length, tz: config.automation.timezone }, 'scheduler started');
}

async function status() {
  const last = await db()('job_runs').select('*').orderBy('id', 'desc').limit(400);
  return Object.entries(JOBS).map(([name, j]) => {
    const runs = last.filter(r => r.job === name);
    return { name, cron: j.cron, stage: j.stage, running: running.has(name), last: runs[0] || null, lastOk: runs.find(r => r.status === 'ok')?.finished_at || null };
  });
}

module.exports = { JOBS, runJob, start, status };
