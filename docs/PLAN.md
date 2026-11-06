# Module schedule, responsibilities & acceptance

Covers deliverables 2, 6 and 7 from section 13 of the brief. The code for every module is already written. The schedule below covers connecting each module to the real accounts and accepting it in the live MWC workflow.

| Wk | Phase | Preeti (AI & backend) | Sanjay (website & tracking) | Acceptance |
|---|---|---|---|---|
| 1 | 1 Foundation | Deploy server, Postgres, backups, secrets; issue users | HTTPS subdomain for the API | `/health` OK, `npm test` passes on the server, restore tested |
| 2 | 2 Offers | Connect Awin and Impact; verify Digistore24 and ClickBank formats; seed the register | — | Discovery + scoring run daily; gateway tested with a real approval |
| 3 | 3 Content | Tune prompts on real drafts; WordPress connector | WP user + Application Password; categories; affiliate-link attributes | Draft → approve → live page, with facts verified |
| 4 | 4 Social & ads | Meta app review, Pinterest app; Ad Library token | Social links/feeds on the site | Scheduled posts go live; ad patterns produce briefs |
| 5 | 5 Chatbot & CRM | Chatbot rules and tone; processing | Widget in footer; forms → `/public/subscribe`; privacy policy | Live chat becomes insights and a consented, segmented contact |
| 6 | 6 Email | MailerLite key, webhook, groups; welcome automations | Domain authentication (SPF/DKIM/DMARC) | Sync, send, open/click and unsubscribe all round-trip |
| 7 | 7 Analytics & loop | GA4/GSC service account; dashboard review | GTM, GA4 events, Meta Pixel, Consent Mode, Search Console | Live acceptance scenario (TESTING.md) passes; automation switched on |

## Module functionality & acceptance criteria

| Module | Automated | Human | Accepted when |
|---|---|---|---|
| Research | GSC demand + chatbot needs become findings weekly; AI synthesis becomes insights | Add external research | New findings appear weekly with sources |
| Ad intelligence | Meta + TikTok ad library ingest daily, AI classification, weekly pattern briefs | Import Google/YouTube ads (CSV) | Ads stored with source links; briefs generated |
| Competitors | Weekly crawl (robots.txt-aware), feature diff, AI recommendations become tasks | Add competitor URLs | Changes detected and recommendations created |
| Offer discovery & evaluation | Daily network pull, relevance filter, AI score, shortlist | — | Shortlist matches demand evidence |
| Approval gateway | Tasks; network "joined" signals | Apply, approve, activate | Nothing reaches Active without an approver |
| Content | Autopilot drafts, compliance, WP drafts, weekly optimisation | Verify facts, publish | Only verified content goes live; inactive-offer pages are removed |
| Creatives & video | Banner sets + finished MP4 shorts (optional voice-over) on publish | Optional design polish | Assets in WP Media; MP4 plays on all platforms |
| Communities | Weekly Reddit/YouTube discovery, AI relevance, growth tracking | Add Facebook groups and Instagram accounts | Relevant communities appear as research |
| Site structure | Monthly AI plan for categories, menu, category and homepage pages | Approve & apply | Categories and menu live; page copy queued |
| Social | Repurpose, schedule, publish to FB/IG/Pinterest/TikTok/YouTube, insights | Submit TikTok/YouTube app audits | Posts live with UTM; performance stored |
| Chatbot | Replies from verified content and active offers; research extraction | — | Insights and consented leads created |
| CRM & segments | Upsert, consent log, hourly segments, lifecycle stages | Reply to enquiries | Correct segments; suppression honoured |
| Email | Hourly sync, AI drafts, weekly newsletters, stats + webhooks | Approve & send | Round-trip engagement into profiles |
| Analytics | Daily GA4/GSC/network pulls; dashboard | — | Dashboard answers the section-7 questions |
| Learning | Daily cycle; safe actions run automatically | Review open insights | Actions visible in content, offers and email |
