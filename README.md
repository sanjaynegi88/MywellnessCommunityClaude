# MWC 360 Platform

The automated, AI-powered business, marketing and customer intelligence system for
**My Wellness Community** (mywellnesscommunity.com): Nutra / human wellness and Pet wellness, USA, UK and Europe.

It runs the full 360° loop from the brief on its own schedule:

```
Research → Ad intelligence → Competitor analysis → Offer discovery → [HUMAN APPROVAL] → Content generation
→ WordPress publishing [HUMAN APPROVAL] → Social promotion → Visitor engagement → Chatbot research
→ Customer database → Segmentation → Email marketing → Analytics → Learning cycle → (back to the start)
```

People only do what the brief says must stay human: applying to affiliate programmes, activating offers,
verifying facts before publishing, and approving email campaigns. Everything else is automated, and each
step that needs a person shows up as a **task** in the console.

> **Status at a glance (2 Nov 2026).** All the code and documents are built, and the end-to-end test passes
> (13/13) with simulated platforms and simulated AI. **The system has not yet run with real accounts or real data.**
> The brief (section 13) counts a module as complete only after it has been demonstrated in the real MWC workflow.
> That is the remaining work. See [Coverage against the brief](#coverage-against-the-brief).

## Coverage against the brief

**Key:** ✅ covered in code and tested in simulation · 🟡 covered by the nearest official alternative (the platform doesn't allow full automation) · ⏳ not done yet (needs accounts, approvals or people)

### Section 1 & 2: the 13 functions and the workflow stages

| Brief requirement | Status | How it is covered / what's missing |
|---|---|---|
| 1. Market & audience research (Stage 1) | ✅ | Team findings, Search Console demand, chatbot needs and community findings feed one research repository; weekly AI synthesis. Research is continuous, not one-off |
| 2. Ads (Stage 2): Meta | ✅ | Daily Meta Ad Library collection, AI classification (hook, pain, trigger, story, CTA, landing page, format, duration), source links kept, weekly pattern briefs, original MWC creatives |
| 2. Ads (Stage 2): TikTok | ✅ | Daily TikTok Commercial Content API collection (needs TikTok research access) |
| 2. Ads (Stage 2): Google / YouTube | 🟡 | The Google Ads Transparency Center has no API, so ads come in by CSV import and are then classified automatically |
| 2. Competitor websites (Stage 3) | ✅ | Weekly crawl that respects robots.txt: navigation, page types, features, lead magnets, conversion elements; AI recommendations become tasks. Structure only; no copying |
| 3. Affiliate offer discovery & evaluation (Stage 4): Awin, Impact, Digistore24 | ✅ | Daily pull → relevance filter → AI scoring against customer demand → shortlist. Digistore24's call format must be **verified on first run** |
| 3. Affiliate offer discovery (Stage 4): ClickBank | 🟡 | ClickBank has no marketplace API. Its marketplace feed is used instead (**verify the URL on first run**), with CSV import as a fallback |
| 3. Affiliate offer discovery (Stage 4): Petco, Zooplus | ✅ | Petco is blocked while rejected. Zooplus is marked "to confirm" (likely via Awin) |
| 4. Human approval & activation (Stage 5) | ✅ | All 9 statuses; automation stops at Shortlisted. Approver + 3 confirmations + tracking link to activate; full audit log; manual reject/pause/replace/deactivate at any time; inactive offers are never promoted |
| 5. Website content, all of Stage 6 (A–E) | ✅ | **A** monthly AI site-structure plan (need-based + technical categories, menu, category pages, homepage sections) applied to WordPress after approval; internal links. **B/C** reviews, comparisons, guides, FAQs, blogs, brand pages. **D** banners, lead-magnet and landing-page drafts. **E** weekly optimisation from GA4/Search Console. Rule-based and AI compliance checks; a person must verify facts before publishing |
| 6. Graphics, videos, creatives | ✅ / 🟡 | Banners in 3 sizes, and a finished 1080×1920 MP4 short per page with an optional AI voice-over. 🟡 The videos are text and graphics only; filmed or stock footage needs an outside tool |
| 7. Social media (section 3): posting | ✅ / 🟡 | Posts to Facebook, Instagram, Pinterest, TikTok and YouTube Shorts through official APIs, with daily insights. 🟡 TikTok and YouTube posts stay **private** until each platform audits the app |
| 7. Social media (section 3): community research | ✅ / 🟡 | Reddit and YouTube communities are found and scored weekly. 🟡 Facebook groups and Instagram accounts have no search API, so they are added by hand and then tracked automatically |
| 7. Social media (section 3): flexibility | ✅ | Adding a platform means adding one entry to the publisher registry |
| 8. AI chatbot (section 4) | ✅ | Widget for WordPress; answers only from published pages and Active offers; collects primary research; consent form; sessions become insights |
| 9–10. Own CRM, profiles, segments, leads (section 5) | ✅ | Central database, consent proof log, unsubscribe list, AI profiles, hourly automatic segments, lifecycle stages, follow-ups, enquiry tasks. No third-party CRM |
| 11. Email via MailerLite (section 6) | ✅ | Hourly sync of consented contacts into segment groups; AI drafts and weekly newsletters; approver sends; opens, clicks and unsubscribes come back by webhook; suppression list. MailerLite only delivers email |
| 12. Analytics (section 7) | ✅ | Daily GA4, Search Console, affiliate network, social and email pulls; central dashboard. GTM, GA4 and Meta Pixel tags on the site are Sanjay's step (⏳) |
| 13. Continuous learning (section 8) | ✅ | The daily learning cycle connects all modules and acts on safe actions (content ideas, offer searches, page refreshes, segment campaigns); everything else becomes a task |

### Sections 9–13: access, architecture, responsibilities, delivery

| Brief requirement | Status | Notes |
|---|---|---|
| Section 9: platform access, no plain-text passwords, 2FA | ✅ | Access register without secrets; keys only in env/secrets manager; read-only API keys; 2FA tracked per platform |
| Section 9: verify actual account & programme access | ⏳ | Needs the real accounts |
| Section 10: modular architecture, central DB, APIs | ✅ | 13+ services, 20 scheduled jobs, REST API, PostgreSQL/SQLite |
| Section 10: security, backups, logging, error handling | ✅ | Roles, audit log, rate limits, signed webhooks, backup script, retries, job run log |
| Sections 11–12: Preeti's and Sanjay's work, phased rollout | ⏳ | 7-week plan in `docs/PLAN.md`: deploy, add keys, platform approvals, website setup |
| Section 13, deliverables 1–9 and 11: diagrams, specs, DB, API, schedule, responsibilities, costs, testing method, handover | ✅ | All in `docs/` |
| Section 13, deliverables 10 and 12: working demonstrations, end-to-end results | ✅ simulated / ⏳ live | 13/13 automated tests pass with simulated platforms; the 12-step **live** test in `docs/TESTING.md` has not been run |

### Not done yet: what makes it "complete" by the brief's definition

1. **Deploy** the server (Docker + PostgreSQL + HTTPS). PostgreSQL has not been tested yet; tests ran on SQLite.
2. **Add real API keys** for Anthropic, WordPress, MailerLite, Awin, Impact, Digistore24, ClickBank, Google, YouTube, Reddit, Pinterest, Meta and TikTok.
3. **Get platform approvals:** Meta app review, TikTok research access and posting audit, YouTube audit, Pinterest.
4. **Website setup (Sanjay):** widget, forms, GTM/GA4/Meta Pixel with cookie consent, an Administrator API user for menus, privacy policy.
5. **First real run:** run every job once and fix any mismatch with real platform responses. Most likely spots: the Digistore24 and ClickBank call formats, the ClickBank feed URL, and the TikTok sign-in request.
6. **Check AI quality:** review real drafts, chatbot answers and scores, and tune the prompts.
7. **Run the 12-step live test** in `docs/TESTING.md` with a real offer, page, visitor and email.

## What's inside

| Path | What it is |
|---|---|
| `src/services/` | One service per module: `intelligence` (research, ads, competitors), `communities` (social audience research), `offers` (discovery, AI scoring, approval gateway), `content`, `structure` (site navigation & categories), `creatives` (banners), `video` (finished MP4 shorts), `social`, `chatbot`, `crm`, `email`, `analytics`, `learning` |
| `src/connectors/` | Official APIs: Awin, Impact (Chewy/Petco), Digistore24, ClickBank (API + marketplace feed), WordPress (posts, media, categories, menus), MailerLite, Meta (Ad Library, Pages, Instagram), TikTok (ad library + video posting), YouTube (channel research + Shorts upload), Reddit (community research), Pinterest, GA4, Search Console, Google Text-to-Speech, plus a competitor crawler that respects robots.txt |
| `src/jobs.js` | The automation schedule (20 jobs) |
| `src/app.js` | REST API, public website endpoints, MailerLite webhook |
| `public/admin/` | The MWC 360 console (served at `/admin`) |
| `public/widget.js` | The website chatbot widget for WordPress |
| `migrations/` | Central database (PostgreSQL in production, SQLite for development/tests) |
| `test/e2e.test.js` | End-to-end acceptance test: the section-13 scenario |
| `docs/` | Architecture & data-flow diagrams, API spec, integration setup, costs, testing, operations |

## Quick start (local)

```bash
npm install
cp .env.example .env            # fill in ANTHROPIC_API_KEY at minimum
npm run seed                    # platform register + build phases from the brief
npm run create-admin -- "Arijit" admin     # prints your API token once
npm start                       # API + console on http://localhost:8080/admin
npm run worker                  # the automation scheduler (separate terminal)
npm test                        # end-to-end scenario, no external accounts needed
```

No accounts yet? Set `AI_MOCK=1` to run everything with deterministic AI answers.
Each connector switches on as soon as its keys are in `.env`; until then its jobs report "not configured".

## Production (Docker)

```bash
cp .env.example .env            # set DB_CLIENT=pg, secrets, SITE_ORIGINS, PUBLIC_BASE_URL
docker compose up -d --build    # postgres + api + worker
docker compose exec api npm run seed
docker compose exec api npm run create-admin -- "Arijit" admin
```

Put the API behind HTTPS (Caddy, Nginx or a managed load balancer) at e.g. `https://api.mywellnesscommunity.com`.
Then Sanjay adds the widget and tracking to WordPress: see `docs/INTEGRATION-SETUP.md`.

## Roles

| Role | Can |
|---|---|
| `admin` | everything, incl. users and deleting customer records |
| `approver` | move offers to Approved/Active, publish content, send campaigns |
| `editor` | create/edit records, run jobs, generate drafts |
| `viewer` | read only |

## What happens automatically

| Area | Automation |
|---|---|
| Research | Weekly: Search Console demand, chatbot needs and community findings become research; AI synthesis |
| Ads | Daily: Meta Ad Library + TikTok ad library ingest; AI classification; weekly pattern briefs. Google/YouTube ads via CSV import (Ads Transparency Center has no API) |
| Communities | Weekly: Reddit communities + YouTube channels found, AI-scored, tracked for growth. Facebook groups and Instagram accounts added by hand, then tracked the same way |
| Competitors | Weekly crawl, feature changes, AI recommendations become tasks |
| Offers | Daily: Awin, Impact, Digistore24, ClickBank feed → relevance filter → AI score → shortlist |
| Site structure | Monthly: AI proposes need-based + technical categories, menu, category pages, homepage sections. An approver applies it in WordPress |
| Content | Daily autopilot drafts (reviews, guides, ideas from learning), compliance, WordPress drafts with real internal links. Weekly optimisation |
| Creatives & video | On publish: 3 banner sizes + a finished 1080×1920 MP4 short (optional AI voice-over) |
| Social | Scheduled posting to Facebook, Instagram, Pinterest, TikTok, YouTube Shorts; daily insights |
| Chatbot → CRM → email | Real-time chat, consent capture, session research, hourly segments and MailerLite sync, webhooks back |
| Analytics & learning | Daily GA4/GSC/network pulls; daily learning cycle acts on safe recommendations |

## Built-in rules (enforced in code, tested in `test/e2e.test.js`)

- Automation can move an offer only from Discovered → Under evaluation → Shortlisted. Approval and activation are human, and need three confirmations plus a tracking link. Every change goes into the audit log.
- Petco (via Impact) is blocked from approval or activation while its platform status is "Rejected".
- Content can link only to Active offers. AI drafts go to WordPress as **drafts**. Publishing needs an approver to confirm that the facts were verified. Health-claim flags must be fixed or explicitly overridden.
- When an offer stops being Active, its pages are reverted to draft and its scheduled posts are blocked.
- Contacts are stored only with explicit consent (the wording, page, time and a hashed IP are logged). Only consented, non-suppressed contacts are synced to MailerLite. Unsubscribes, bounces and spam reports come back by webhook and suppress the contact.
- Every email gets an unsubscribe footer. Campaigns are sent only after an approver says so.
- No passwords or API keys are stored in the database. All secrets come from environment variables or a secrets manager.

## Platform approvals you still need (outside our control)

- **Meta**: identity-verified developer app + app review (Ad Library, Page and Instagram publishing).
- **TikTok**: Commercial Content API access (ad research). Content Posting API audit: until it passes, posts go up as **private**; the console shows this on each post.
- **YouTube**: until the Google API compliance audit passes, uploads from unverified projects are **private**.
- **Pinterest**: app approval for `pins:write`.
- **WordPress**: the API user must be an **Administrator** for menu changes (Editors can manage posts and categories).
