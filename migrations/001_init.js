// Central MWC database.
// Business records use a "document table" layout: indexed columns for the fields the system
// filters on (status, ext_key, kind) plus a JSON body. New networks, platforms and fields can be
// added without schema changes, which is what the brief asks for ("without complete redevelopment").

const DOC_TABLES = [
  'research',      // secondary market research findings
  'ads',           // advertising intelligence (ads analysed, with source links)
  'competitors',   // competitor websites + crawl snapshots
  'offers',        // central affiliate offer database (status machine)
  'content',       // all website content (structure, product, informational, promotional)
  'creatives',     // banners, graphics, video scripts
  'social',        // social posts (planned → posted) + performance
  'contacts',      // CRM: central customer database
  'interactions',  // CRM: interaction history
  'campaigns',     // email campaigns and sequences
  'metrics',       // analytics & performance data points
  'insights',      // learning engine: needs, questions, trends, recommendations
  'chats',         // chatbot sessions (transcript + extracted research)
  'platforms',     // affiliate platform access register (no secrets)
  'phases',        // implementation phases & acceptance
  'tasks',         // automation-created work items for humans
];

exports.up = async (knex) => {
  for (const t of DOC_TABLES) {
    await knex.schema.createTable(t, (tb) => {
      tb.string('id', 40).primary();
      tb.string('status', 40).index();
      tb.string('kind', 60).index();
      tb.string('ext_key', 200).index();       // external id (network:programmeId, wp post id, email…)
      tb.text('data').notNullable();           // JSON body
      tb.string('created_at', 30).index();
      tb.string('updated_at', 30).index();
    });
  }
  await knex.schema.createTable('users', (tb) => {
    tb.string('id', 40).primary();
    tb.string('name', 120).notNullable();
    tb.string('role', 20).notNullable();       // admin | approver | editor | viewer
    tb.string('token_hash', 200).notNullable().unique();
    tb.string('created_at', 30);
    tb.boolean('disabled').defaultTo(false);
  });
  await knex.schema.createTable('audit', (tb) => {
    tb.increments('id');
    tb.string('at', 30).index();
    tb.string('actor', 120);
    tb.string('action', 120).index();
    tb.string('ref', 120).index();
    tb.text('detail');
  });
  await knex.schema.createTable('job_runs', (tb) => {
    tb.increments('id');
    tb.string('job', 60).index();
    tb.string('started_at', 30).index();
    tb.string('finished_at', 30);
    tb.string('status', 20);
    tb.text('summary');
    tb.text('error');
  });
  await knex.schema.createTable('webhook_events', (tb) => {
    tb.increments('id');
    tb.string('source', 40);
    tb.string('type', 80).index();
    tb.text('payload');
    tb.string('received_at', 30);
    tb.boolean('processed').defaultTo(false).index();
  });
  await knex.schema.createTable('suppression', (tb) => {
    tb.string('email', 254).primary();
    tb.string('reason', 80);
    tb.string('at', 30);
  });
  await knex.schema.createTable('consent_log', (tb) => {
    tb.increments('id');
    tb.string('contact_id', 40).index();
    tb.string('email', 254).index();
    tb.string('action', 20);                   // granted | withdrawn
    tb.text('consent_text');
    tb.string('source', 60);
    tb.string('page', 500);
    tb.string('ip_hash', 80);
    tb.string('at', 30);
  });
};

exports.down = async (knex) => {
  for (const t of ['consent_log', 'suppression', 'webhook_events', 'job_runs', 'audit', 'users', ...DOC_TABLES]) await knex.schema.dropTableIfExists(t);
};
exports.DOC_TABLES = DOC_TABLES;
