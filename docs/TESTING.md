# Testing & validation

Covers deliverables 9 and 12 from section 13 of the brief: the testing methodology and the end-to-end integration test results.

## Method
1. **Automated end-to-end acceptance test** (`npm test`, `test/e2e.test.js`). This runs the brief's section-13 scenario against the real API, database and services. External platforms are simulated at the HTTP level, and AI runs in deterministic mock mode, so the test needs no accounts and gives the same result every time.
2. **Job smoke test**: every scheduled job is run once on a fresh database. Unconfigured connectors must report "not configured" rather than fail.
3. **Console browser test**: sign in, open all 16 screens, add an offer, run a chatbot session, save a consented lead, run a job, with no page errors.
4. **Live acceptance**, with real accounts before go-live (see below). A module counts as complete only after it passes here.

## Results (build delivered 2 Nov 2026)

Run on SQLite in development:

```
ok 1 - AI discovers relevant offers only and evaluates them  (Awin, Impact, ClickBank feed)
ok 2 - Human approval gateway: automation and editors cannot activate
ok 3 - Petco stays blocked (application rejected)
ok 4 - AI generates content for the active offer and sends drafts to WordPress
ok 5 - Publishing needs an approver and verified facts; then creatives + social are produced
       (banners, real MP4 checked with ffprobe, FB/Pinterest/TikTok/YouTube posted, Instagram without keys → task)
ok 6 - Visitor chats, gives consent, becomes a segmented customer
ok 7 - Eligible subscribers sync to MailerLite; engagement and unsubscribes flow back
ok 8 - New insights change what happens next (learning cycle acts)
ok 8b - Ads from TikTok + imported Google/YouTube ads are classified
ok 8c - Communities are discovered, scored and fed into research
ok 8d - Site structure: AI proposes, approver applies to WordPress (categories, nesting, menu, location)
ok 9 - Pausing an offer unpublishes its content and blocks its posts
ok 10 - Jobs are logged; widget and console are served; API needs a token
# tests 13  pass 13  fail 0
```

- **Job smoke test**: all 20 jobs completed without error. Competitor crawler against a sample site: 7 features and the navigation were detected, and robots.txt was respected.
- **Console browser test**: all screens loaded, including Communities, Site Structure and ad import; no script errors.

**Not yet verified** (needs real accounts or production infrastructure):
- real platform response formats, especially the Digistore24, ClickBank and TikTok OAuth calls, which are marked "verify on first run"
- the ClickBank feed URL still being published
- PostgreSQL in production (tests ran on SQLite)
- real AI output quality
- the widget on the live theme

## Live acceptance scenario (run with real accounts)

| # | Step | Pass when |
|---|---|---|
| 1 | Run `offers.discover` and `offers.score` | Relevant programmes from each connected network appear; high-fit ones are Shortlisted with a task |
| 2 | Apply on the network, move to Approval pending, then Approved | Audit log shows each step and who did it |
| 3 | Activate with the 3 confirmations and a tracking link | Offer is Active; Petco cannot be approved |
| 4 | Run `content.autopilot` | A review and a buying guide appear as **WordPress drafts** with compliance notes |
| 5 | Verify facts, then Approve & publish | Page is live; banners appear in WP Media; social posts are scheduled |
| 6 | Wait for `social.publish` | FB, IG, Pinterest posts live with UTM links; the MP4 short is on TikTok and YouTube (private until each app audit passes) |
| 7 | Chat on the live site, then submit the form with consent | `consent_log` row is written; contact is created with segments |
| 8 | Wait for `chat.process` and `email.sync` | Insights are created; the subscriber is in the right MailerLite groups |
| 9 | Send an approved campaign; click a link; unsubscribe | Engagement rises; then the contact is suppressed and unsubscribed in MailerLite |
| 10 | Run `analytics.pull` and `learning.cycle` | GA4/GSC rows are stored; new ideas or offer searches are created from the data |
| 11 | Pause the offer | WordPress page reverts to draft; scheduled posts are blocked |
| 12 | Run `communities.discover` and `structure.propose`, then apply | Relevant communities listed; categories and menu appear in WordPress |
