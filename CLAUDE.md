# CLAUDE.md

This file guides Claude Code (claude.ai/code) when working in this repository.

## What this is

MWC 360 Platform: a Node.js (>=20, CommonJS) backend that automates marketing and customer
intelligence for **My Wellness Community** (mywellnesscommunity.com), an affiliate site for
human wellness (supplements) and pet wellness in the USA, UK and Europe. It runs a scheduled loop:
research → ad/competitor intelligence → affiliate offer discovery & AI scoring → **human approval** →
AI content → WordPress drafts → **human publish** → banners/MP4 shorts → social posting →
chatbot → CRM/segments → MailerLite email → analytics → learning cycle → repeat.

The WordPress site itself (theme, widget embed, GTM/GA4) is maintained separately; this repo only
talks to it over the WP REST API (`src/connectors/wordpress.js`) and serves `public/widget.js`.

Status: code complete and the e2e test passes with simulated platforms + mock AI; **never run with
real accounts**. See README "Not done yet".

## Commands

```bash
npm install
cp .env.example .env               # AI_MOCK=1 lets everything run without an Anthropic key
npm run seed                       # platform register + build phases (data/seed.json)
npm run create-admin -- "Name" admin   # prints an API token once
npm start                          # API + console at http://localhost:8080/admin (migrates on boot)
npm run dev                        # same, with node --watch
npm run worker                     # cron scheduler (separate process); or RUN_SCHEDULER=true in the API
npm run migrate                    # knex migrate:latest
npm test                           # node --test, the whole suite is test/e2e.test.js
node --test --test-name-pattern="Petco" test/e2e.test.js   # run one scenario
```

Production: `docker compose up -d --build` (postgres:16 + api + worker). The Dockerfile installs
ffmpeg and fonts, which video and banner rendering need locally too (`FFMPEG_PATH`).

## Architecture

- `src/config.js`: the **only** place env vars are read. Every secret comes from env; none go in
  the DB or source. A connector counts as "configured" once its keys are present; until then its
  jobs report "not configured" and don't fail.
- `src/db.js` + `migrations/`: a Knex **document-table** layout. Each business table (`DOC_TABLES`
  in `001_init.js` plus `TABLES` in `002_communities_plans.js`) has indexed `id/status/kind/ext_key`
  columns and a JSON `data` body. Use `repo(table)` (`get/list/insert/update/upsertByExtKey/remove`)
  rather than raw queries. New fields need no migration; a new collection must be added to a
  migration's table list or `assertTable` rejects it. Relational tables: `users`, `audit`,
  `job_runs`, `consent_log`, `suppression`, `webhook_events`. SQLite (better-sqlite3) is used in dev
  and tests, `pg` in prod. **PostgreSQL is untested**, so keep queries portable (e.g. `.returning`).
- `src/services/*`: one module per stage (offers, content, structure, creatives, video, social,
  chatbot, crm, email, analytics, intelligence, communities, learning, tasks). They contain the
  business rules.
- `src/connectors/*`: thin official-API clients. All outbound HTTP goes through
  `src/lib/http.js` (timeouts, retry on 429/5xx, errors that don't leak credentials).
- `src/lib/ai.js`: the single Claude gateway. `complete(task, …)` / `json(task, …)` take a named
  `task` (e.g. `offer.score`) and prepend `BRAND_RULES` (no invented reviews or health claims,
  `[VERIFY]` markers, affiliate disclosure). Models come from `ANTHROPIC_MODEL` /
  `ANTHROPIC_QUICK_MODEL` (`tier: 'quick'`). **When adding an AI task, add a matching
  deterministic answer to `src/lib/aiMock.js`**, or mock mode and tests break.
- `src/jobs.js`: the `JOBS` map (20 cron jobs, Europe/London). Every run is logged in `job_runs`
  and can be triggered manually from the API/console.
- `src/app.js`: Express. `/api` (token + role: admin > approver > editor > viewer, `src/lib/auth.js`),
  `/public` (CORS limited to `SITE_ORIGINS`: chatbot, forms), MailerLite webhook (signed),
  `/admin` (single-file console `public/admin/index.html`), `/widget.js`, `/media`.

## Rules enforced in code (and tested). Don't weaken them.

- Offers (`services/offers.js` `STATUSES`/`transition`): automation can move an offer only from
  Discovered → Under evaluation → Shortlisted. Approval and activation are human (approver role,
  3 confirmations + a tracking link), and every change is audited. Petco/Impact stays blocked while
  its platform status is Rejected.
- `PROTECTED` fields in `app.js` can't be changed through the generic CRUD endpoints; they change
  only via dedicated endpoints (approve & publish, approve & send, transitions).
- Content links only to Active offers. AI drafts go to WordPress as drafts. Publishing needs an
  approver and `factsVerified`. Health-claim flags (`lib/compliance.js`) must be fixed or overridden.
  When an offer leaves Active, its pages revert to draft and its scheduled posts are blocked.
- Contacts are stored only with logged consent (wording, page, time, hashed IP). Only consented,
  non-suppressed contacts sync to MailerLite. Campaigns send only after approval and always carry
  an unsubscribe footer.

## Tests

`test/e2e.test.js` is the acceptance scenario from section 13 of the brief. It sets env vars before
requiring the app, replaces `global.fetch` with simulated platforms (WordPress, Awin, Impact,
ClickBank feed, MailerLite, Meta, TikTok, YouTube, Reddit…), uses `AI_MOCK=1` and a throwaway
SQLite file, and runs serially (`--test-concurrency=1`). A new connector call needs a matching
route in that fake `fetch`.

## Docs

`docs/` holds architecture/data-flow diagrams (mermaid), API spec, integration setup (the WordPress
side), costs, testing (the unrun 12-step live test), operations, and the 7-week rollout plan.
Some docs say "18 scheduled jobs", but `src/jobs.js` defines 20.
