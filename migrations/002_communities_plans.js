// Adds: communities (social groups/channels/subreddits relevant to MWC audiences)
//       plans (AI-proposed site-structure changes awaiting human approval)
const TABLES = ['communities', 'plans'];
exports.up = async (knex) => {
  for (const t of TABLES) {
    if (await knex.schema.hasTable(t)) continue;
    await knex.schema.createTable(t, (tb) => {
      tb.string('id', 40).primary(); tb.string('status', 40).index(); tb.string('kind', 60).index();
      tb.string('ext_key', 200).index(); tb.text('data').notNullable();
      tb.string('created_at', 30).index(); tb.string('updated_at', 30).index();
    });
  }
};
exports.down = async (knex) => { for (const t of TABLES) await knex.schema.dropTableIfExists(t); };
exports.TABLES = TABLES;
