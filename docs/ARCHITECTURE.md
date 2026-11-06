# Architecture

Deliverables 1, 3 and 4 from section 13 of the brief: the technical architecture diagram, the data flow and integration diagram, and the central database structure.

## 1. Technical architecture

```mermaid
flowchart LR
  subgraph Site["mywellnesscommunity.com (WordPress — Sanjay)"]
    W[Pages & posts]:::ext
    WID[Chatbot widget.js]
    FORMS[Subscribe / contact forms]
    GTM[GTM → GA4 + Meta Pixel]:::ext
  end

  subgraph Platform["MWC 360 Platform (Node.js — Preeti)"]
    API[REST API<br/>/api /public /webhooks]
    WORKER[Automation worker<br/>18 scheduled jobs]
    subgraph Engines
      INT[Intelligence engine<br/>research · ads · competitors]
      OFF[Offer engine<br/>discovery · AI scoring]
      GATE[Human approval gateway]
      CON[Content engine<br/>generate · compliance · publish]
      CRE[Creative engine<br/>banners · MP4 shorts]
      STR[Structure engine<br/>categories · menus]
      COM[Community engine]
      SOC[Social engine]
      BOT[Chatbot engine]
      CRM[CRM & segmentation]
      EM[Email engine]
      ANA[Analytics engine]
      LRN[Learning engine]
    end
    DB[(Central database<br/>PostgreSQL)]
    AI[Claude API]:::ext
    CONSOLE[MWC 360 Console /admin]
  end

  subgraph External["Official third-party APIs"]
    AFF[Awin · Impact · Digistore24 · ClickBank]:::ext
    ML[MailerLite]:::ext
    META[Meta Ad Library · FB Page · Instagram]:::ext
    PIN[Pinterest · TikTok · YouTube · Reddit]:::ext
    G[GA4 Data API · Search Console]:::ext
  end

  WID --> API
  FORMS --> API
  API --- Engines
  WORKER --- Engines
  Engines --- DB
  Engines --> AI
  OFF --> AFF
  CON --> W
  STR --> W
  COM --> PIN
  SOC --> META & PIN
  INT --> META
  EM --> ML
  ML -- webhooks --> API
  ANA --> G
  GTM --> G
  CONSOLE --> API
  classDef ext fill:#eef,stroke:#88a
```

**Processes.** `api` serves the console, the REST API, the public website endpoints and webhooks. `worker` runs the schedule in `src/jobs.js`. Both share one database. Small deployments can run both in one process (`RUN_SCHEDULER=true`).

**Extensibility.** A new affiliate network is one connector that returns the normalised offer shape (`src/connectors/affiliate.js`). A new social platform is one entry in the `publishers` registry (`src/connectors/social.js`). A different email provider replaces one file (`src/connectors/mailerlite.js`). None of these needs a database change, because business records are JSON documents with indexed status and key columns.

## 2. Data flow & feedback loops

```mermaid
flowchart TD
  R[Secondary research<br/>GSC queries · team findings · chatbot needs] --> AD[Ad intelligence<br/>Meta Ad Library → AI classification → patterns]
  AD --> CP[Competitor analysis<br/>crawl structure → AI recommendations]
  CP --> OD[Offer discovery<br/>network programme lists → relevance filter]
  OD --> SC[AI evaluation<br/>score vs. demand context]
  SC -->|Shortlisted + task| H1{{HUMAN: apply to network}}
  H1 --> H2{{HUMAN: Approved → Active<br/>3 confirmations + tracking link}}
  H2 --> CG[Content autopilot<br/>review + buying guide drafts]
  CG --> CC[Compliance: rules + AI review]
  CC --> WPD[WordPress DRAFT]
  WPD --> H3{{HUMAN: verify facts → Approve & publish}}
  H3 --> PUB[Published page]
  PUB --> CR[Banners + finished MP4 short]
  R --> ST[Monthly structure plan] --> H5{{HUMAN: apply}} --> PUB
  CM[Community discovery<br/>Reddit · YouTube · manual groups] --> R
  CR --> SP[Social posts → scheduled → posted via APIs<br/>FB · IG · Pinterest · TikTok · YouTube Shorts]
  SP --> V[Visitors]
  PUB --> V
  V --> CB[Chatbot conversation]
  CB -->|consent form| CRM[(Customer database)]
  CB --> EX[Session extraction<br/>needs · questions · unmet needs]
  EX --> INS[Insights]
  CRM --> SEG[Automatic segments]
  SEG --> ES[Hourly sync of consented contacts → MailerLite groups]
  ES --> H4{{HUMAN: approve campaign}}
  H4 --> SEND[MailerLite sends]
  SEND -->|webhooks: open/click/unsubscribe| CRM
  V --> GA[GA4 / Search Console]
  GA --> AN[Analytics pull + optimisation]
  AN -->|page dropping / page 2| CG
  INS --> L[Learning cycle]
  AN --> L
  SEG --> L
  L -->|content.idea| CG
  L -->|discovery.keyword| OD
  L -->|email.campaign| ES
  L -->|research| R
  OFFX[Offer paused / rejected / expired] -->|auto-unpublish pages, block posts| PUB
```

## 3. Offer status machine (the approval gateway)

```mermaid
stateDiagram-v2
  [*] --> Discovered: discovery job / import / manual
  Discovered --> UnderEvaluation: AI (automatic)
  UnderEvaluation --> Shortlisted: AI if score ≥ SHORTLIST_SCORE
  Shortlisted --> ApprovalPending: human (applied)
  ApprovalPending --> Approved: approver
  Approved --> Active: approver + confirmations + link
  Active --> Paused: human
  Paused --> Active: approver
  Active --> Expired: human
  UnderEvaluation --> Rejected
  Shortlisted --> Rejected
  ApprovalPending --> Rejected
  Approved --> Rejected
  Active --> Rejected
  Rejected --> UnderEvaluation: re-evaluate
  Expired --> UnderEvaluation
```

Only **Active** offers can be linked to content, mentioned by the chatbot, put in emails or posted on social media.

## 4. Central database

| Table | Purpose | Key fields (JSON body) |
|---|---|---|
| `research` | Secondary + primary research findings | title, category, vertical, market, finding, source, confidence |
| `ads` | Ads analysed (with source links) | brand, platform, format, hook, pain, trigger, story, cta, landing, source, runningDays |
| `competitors` | Competitor sites + crawl snapshots | name, url, features[], gaps, recommendations[], lastCrawl |
| `offers` | Central affiliate offer database | name, network, vertical, category, markets, commission, score, evaluation, status, activatedBy, affiliateLink |
| `content` | All website content | title, type, vertical, offerId, status, body, html, compliance, factsVerified, wpId, wpUrl |
| `creatives` | Banner sets, video scripts, creative briefs | contentId, copy, files{facebook,instagram,pinterest}, videoScript |
| `social` | Posts and their performance | platform, format, caption, link (UTM), imageUrl, date, status, reach, clicks |
| `contacts` | CRM: one record per person | email, name, country, vertical, interests[], needs, source, stage, engagement, consentEmail, suppressed, segments[], history[] |
| `interactions` | CRM interaction history | contactId, kind, text |
| `campaigns` | Email campaigns | name, type, segment, subject, body, status, mlId, sent, opens, clicks, unsubs |
| `metrics` | Analytics data points | date, source, page, query, sessions, clicks, conversions, revenue, position |
| `insights` | Learning engine | text, why, kind, module, priority, status, autoAction |
| `chats` | Chatbot sessions | turns[], summary, needs[], questions[], unmetNeeds[], contactId |
| `communities` | Social groups, subreddits, channels | name, platform, url, audience, activity, relevance, audienceNeeds, approach, rules, history[], growthPct |
| `plans` | AI site-structure proposals | plan{categories, menu, assignments, homepageSections, categoryPages}, diff, status, result |
| `platforms` | Affiliate access register (no secrets) | name, accountStatus, api, twoFA, vault |
| `phases` | Implementation phases | title, scope, acceptance, owner, status |
| `tasks` | Work queue for people | title, detail, module, ref, role, priority, status |
| `users` | Console/API users | name, role, token_hash |
| `audit` | Every approval, publish, consent change | at, actor, action, ref, detail |
| `job_runs` | Automation run log | job, started_at, finished_at, status, summary, error |
| `consent_log` | Proof of consent / withdrawal | email, action, consent_text, source, page, ip_hash, at |
| `suppression` | Never-email list | email, reason, at |
| `webhook_events` | Raw inbound events | source, type, payload |

Every document table has the columns `id, status, kind, ext_key, data (JSON), created_at, updated_at`.
