# Cost & subscription requirements

Deliverable 8 from section 13 of the brief. Prices change often, so this list names what you pay for and what drives each cost. Check current pricing before you budget.
The platform itself has no licence fees. Everything in it is open-source (Node.js, PostgreSQL, Express, Knex).

| Item | Needed? | What drives the cost | Notes |
|---|---|---|---|
| Server (VPS or container host) | Yes | 2 vCPU / 4 GB RAM is enough to start | Runs `api` + `worker` |
| PostgreSQL | Yes | Self-hosted in Docker (included above) or managed | Managed is easier to back up |
| Off-site backup storage | Yes | A few GB | Any S3-compatible bucket |
| Domain / HTTPS | Yes | Let's Encrypt is free | `api.mywellnesscommunity.com` |
| Anthropic API (Claude) | Yes | Pay per token; see the estimate below | Biggest variable cost |
| MailerLite | Yes | Number of subscribers and sends | A free tier exists for small lists. API, webhooks and automations need to be on your plan; check this |
| Meta / Pinterest / Google / TikTok / Reddit / YouTube APIs | Yes | Free within standard quotas | App reviews/audits required (see README) |
| Google Cloud Text-to-Speech | Optional | Characters synthesised (about 600 per video) | Voice-over for videos; a free monthly allowance exists, so check current terms |
| Affiliate networks | Yes | Free for publishers | Awin may charge a refundable sign-up deposit; check |
| WordPress hosting | Existing | — | Already in place |
| CRM | **No** | — | Built in, as the brief requires |
| Ad-intelligence SaaS | Optional | — | Not needed: Meta and TikTok ad libraries are built in, and Google/YouTube ads come in through CSV import |
| Image/video generation SaaS | Optional | — | Banners and finished MP4 shorts are rendered in-house (ffmpeg). A paid tool is only needed for filmed or stock footage |

## Estimating the AI bill

Each job logs input and output tokens per call (`ai call` log lines). This is a typical day:

| Job | Calls/day | Approx. tokens per call (in / out) |
|---|---|---|
| Offer scoring | 20 | 4k / 0.5k |
| Content drafts (+ compliance review) | 5 × 2 | 4k / 3k |
| Chatbot replies (fast model) | per visitor message | 2k / 0.15k |
| Chat extraction (fast model) | per session | 2k / 0.3k |
| Ad classification (fast model) | 40 | 0.8k / 0.2k |
| Learning cycle | 1 | 15k / 2k |

Multiply by the per-token prices of `ANTHROPIC_MODEL` and `ANTHROPIC_QUICK_MODEL` on Anthropic's pricing page. Set a monthly spend limit in the Anthropic console.
