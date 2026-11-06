# API & integration specification

Deliverable 5 from section 13 of the brief. The base URL is your API host, e.g. `https://api.mywellnesscommunity.com`.

## Authentication

Admin endpoints need `Authorization: Bearer <token>`. Tokens are created with `npm run create-admin` or with `POST /api/users` (admin only). Only a hash of each token is stored.

## Public website endpoints (no token; CORS limited to `SITE_ORIGINS`; 30 requests/min per IP)

| Method & path | Body | Result |
|---|---|---|
| `POST /public/chat` | `{sessionId?, message, page}` | `{sessionId, reply}` |
| `POST /public/lead` | `{sessionId?, name, email, consent:true, consentText?, page}` | `{ok}` — 400 without consent |
| `POST /public/subscribe` | `{name, email, consent:true, page, interests?, vertical?, leadMagnet?}` | `{ok}` |
| `POST /public/contact` | `{name, email, message, consent?, page}` | `{ok}` + a high-priority task |
| `GET /public/consent-text` | — | `{text}` |
| `GET /widget.js` | — | chatbot widget script |

## Webhooks

| Path | Verification |
|---|---|
| `POST /webhooks/mailerlite` | HMAC-SHA256 of the raw body with `MAILERLITE_WEBHOOK_SECRET`, sent in the `Signature` header |

Events handled: `subscriber.unsubscribed`, `subscriber.bounced` and `subscriber.spam_reported` (suppress the contact), and `campaign.open` and `campaign.click` (log engagement).

## Admin API

| Method & path | Min role | Purpose |
|---|---|---|
| `GET /api/me` | viewer | current user |
| `GET /api/{collection}?status=&limit=` | viewer | list records (collections as in ARCHITECTURE §4) |
| `GET /api/{collection}/{id}` | viewer | one record |
| `POST /api/{collection}` | editor | create (protected fields ignored; offers always start "Discovered") |
| `PATCH /api/{collection}/{id}` | editor | edit (cannot change offer status, publish content, set consent or send email) |
| `DELETE /api/{collection}/{id}` | editor (contacts: admin) | delete |
| `POST /api/offers/{id}/transition` | editor (Approved/Active: approver) | `{to, confirmations?, affiliateLink?, approvalRef?, reason?}` |
| `POST /api/offers/{id}/evaluate` | editor | AI score + reasoning |
| `POST /api/offers/import` | editor | `{network, rows:[{id,name,category,commission,gravity,url}]}`, e.g. a ClickBank marketplace export |
| `POST /api/content/{id}/generate` | editor | AI draft + compliance (offer must be Active) |
| `POST /api/content/{id}/push-draft` | editor | send the draft to WordPress |
| `POST /api/content/{id}/approve` | approver | `{factsVerified:true, complianceOverrideNote?}` → publish |
| `POST /api/content/{id}/creatives` | editor | banner set + video script |
| `POST /api/content/{id}/repurpose` | editor | social posts |
| `POST /api/content/{id}/video` | editor | render a finished MP4 short |
| `POST /api/ads/import` | editor | `{rows:[{advertiser,platform,format,hook,url,firstShown,duration}], source}` |
| `POST /api/structure/propose` | editor | AI site-structure plan |
| `POST /api/plans/{id}/apply` | approver | apply categories, post assignments, menu; queue page copy |
| `POST /api/plans/{id}/reject` | approver | `{reason}` |
| `POST /api/contacts/{id}/profile` | editor | AI profile |
| `POST /api/contacts/{id}/interaction` | editor | `{kind, text}` |
| `POST /api/contacts/{id}/consent` | editor | `{consentText, source, page}` (documented offline consent) |
| `POST /api/contacts/{id}/withdraw` | editor | unsubscribe + suppress |
| `POST /api/campaigns/draft` | editor | `{segment, type}` → AI draft |
| `POST /api/campaigns/{id}/send` | approver | create + send in MailerLite |
| `POST /api/chats/{sessionId}/process` | editor | extract insights now |
| `GET /api/analytics/dashboard?days=30` | viewer | consolidated performance |
| `GET /api/jobs` | viewer | schedule + last runs |
| `POST /api/jobs/{name}/run` | editor | run a job now |
| `GET /api/audit?ref=offer:ID` | viewer | audit trail |
| `POST /api/ai/complete`, `/api/ai/json` | editor | console AI helpers |
| `POST /api/users` | admin | `{name, role}` → token (shown once) |

Errors are always `{error: "message"}` with status 400 (bad input), 401, 403 (role), 404, 409 (rule conflict, e.g. offer not Active) or 500.

## Outbound integrations

| Platform | Used for | Endpoint(s) | Auth |
|---|---|---|---|
| Anthropic | all AI tasks | Messages API | `ANTHROPIC_API_KEY` |
| Awin | programmes, details, transactions | `api.awin.com/publishers/{id}/programmes`, `/programmedetails`, `/transactions/` | Bearer token |
| Impact | campaigns (Chewy, Petco), actions | `api.impact.com/Mediapartners/{SID}/Campaigns`, `/Actions` | Basic SID:token |
| Digistore24 | marketplace entries | `listMarketplaceEntries`. **Verify the call format on first run** | API key |
| ClickBank | affiliate analytics. Marketplace via export import | `api.clickbank.com/rest/1.3/analytics/...`. **Verify on first run** | API key |
| WordPress | drafts, publishing, media, categories, menus | `/wp-json/wp/v2/posts`, `/pages`, `/media`, `/categories`, `/menus`, `/menu-items` | Application Password |
| MailerLite | subscribers, groups, campaigns, webhooks | `connect.mailerlite.com/api/...` | Bearer key |
| Meta | Ad Library research; Page and Instagram publishing and insights | Graph API `ads_archive`, `/{page}/feed`, `/{ig}/media` + `/media_publish` | App or Page token |
| Pinterest | pins | `api.pinterest.com/v5/pins` | OAuth token |
| TikTok | ad research; video posting | `open.tiktokapis.com/v2/research/adlib/ad/query/`, `/v2/post/publish/creator_info/query/`, `/v2/post/publish/video/init/` (PULL_FROM_URL). **Verify the OAuth token request on first run** | client credentials / user refresh token |
| YouTube | channel research; Shorts upload | `youtube/v3/search`, `/channels`, `upload/youtube/v3/videos` | API key / OAuth refresh token |
| Reddit | community research (read-only) | `oauth.reddit.com/subreddits/search` | app-only OAuth |
| Google TTS | video voice-over | `texttospeech.googleapis.com/v1/text:synthesize` | Service account |
| ClickBank feed | marketplace discovery | `CLICKBANK_FEED_URL` (zipped XML). **Verify on first run** | none |
| Google | GA4 reports, Search Console queries | `analyticsdata.googleapis.com …:runReport`, `webmasters/v3/…/searchAnalytics/query` | Service account |
