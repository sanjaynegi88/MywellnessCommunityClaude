# Integration setup (Sanjay + Preeti)

Work through these in order. Each connector switches on when its keys are added to `.env` (or your secrets manager) and the services are restarted.

## 1. Server
1. Deploy with `docker compose up -d --build` on a VPS or a managed container service.
2. Point `api.mywellnesscommunity.com` at it with HTTPS (Caddy or Nginx with Let's Encrypt, or Cloudflare).
3. Run `npm run seed` and `npm run create-admin -- "Arijit" admin`. Create approver and editor tokens for Preeti and Sanjay with `POST /api/users`.

## 2. WordPress (Sanjay)
1. Create a dedicated WordPress user `mwc360` with the **Editor** role. Under Users → Profile → Application Passwords, create a password and put it in `WP_USER` / `WP_APP_PASSWORD`.
2. Add the chatbot to the footer, using a plugin such as WPCode:
   ```html
   <script>window.MWC_CHAT = { privacyUrl: '/privacy-policy/' };</script>
   <script src="https://api.mywellnesscommunity.com/widget.js" defer></script>
   ```
3. Point the subscription and lead-magnet forms at `POST /public/subscribe` with `consent: true` from an **unticked** checkbox. A small JavaScript snippet or a form plugin webhook can do this.
4. Add `data-offer-id` and `data-network` attributes to affiliate links. The platform does this automatically for content it publishes.
5. Update the privacy policy to cover the chatbot, the CRM and MailerLite.

## 3. Tracking (Sanjay)
1. Install GTM on the site. In GTM, add GA4 and the Meta Pixel.
2. Create GA4 events from these dataLayer events: `chatbot_open`, `chatbot_lead`, `affiliate_click` (params `offer_id`, `network`), `newsletter_signup`. Mark `affiliate_click` and `chatbot_lead` as **key events**.
3. Map `chatbot_lead` and `newsletter_signup` to the Pixel `Lead` event.
4. Run tags only after cookie consent (GTM Consent Mode). This is needed for UK and EU visitors.
5. In Google Cloud, create a service account and download its JSON key. Add the account's email as a **Viewer** on the GA4 property and as a **user** in Search Console. Set `GOOGLE_SERVICE_ACCOUNT_JSON`, `GA4_PROPERTY_ID` and `GSC_SITE_URL`.

## 4. Affiliate networks (Preeti)
Use **read-only** API keys wherever the network offers them. Store them only in the secrets manager.
- **Awin**: Toolbox → API Credentials → `AWIN_API_TOKEN`. The publisher ID is in the account URL.
- **Impact**: Settings → API → Account SID + Auth Token (read-only).
- **Digistore24**: Settings → API keys, with read permission. Run `POST /api/jobs/offers.discover/run` once and check the job result. If it fails, adjust `digistore24.call()` to the format shown in your API settings.
- **ClickBank**: API Management → API key, analytics permission. For marketplace discovery, export the marketplace list and send it to `POST /api/offers/import`.
- Turn on 2FA on every network account. Record each account's status in the console under Integrations → access register.

## 5. MailerLite (Preeti)
1. Integrations → API → create a token → `MAILERLITE_API_KEY`.
2. Create a webhook pointing at `https://api.mywellnesscommunity.com/webhooks/mailerlite`, with these events: subscriber.unsubscribed, subscriber.bounced, subscriber.spam_reported, campaign.open, campaign.click. Put its signing secret in `MAILERLITE_WEBHOOK_SECRET`.
3. Create the welcome automations in MailerLite, triggered when a subscriber joins the groups **Nutra wellness** and **Pet wellness**. The platform adds contacts to those groups automatically.
4. Authenticate the sending domain (SPF, DKIM, DMARC) in MailerLite.

## 6. Social (Preeti)
- **Meta Ad Library**: create a Meta developer app, complete identity verification, and generate a user token for `META_ACCESS_TOKEN`. All ad types are returned only for EU countries (`AD_COUNTRIES`).
- **Facebook Page and Instagram**: in the same app, add the permissions `pages_manage_posts`, `pages_read_engagement`, `instagram_basic` and `instagram_content_publish`, and complete app review. Then set `META_PAGE_ID`, `META_PAGE_TOKEN` (a long-lived Page token) and `META_IG_USER_ID`.
- **Pinterest**: create an app with the `pins:write` and `boards:read` scopes. Set `PINTEREST_TOKEN` and `PINTEREST_BOARD_ID`.
- **TikTok**: create an app at developers.tiktok.com.
  - *Ad research*: apply for the **Commercial Content API**. Once approved, set `TIKTOK_ADLIB_ENABLED=true`.
  - *Posting*: add the **Content Posting API** (Direct Post, scope `video.publish`). Authorise the MWC TikTok account once to get `TIKTOK_REFRESH_TOKEN`. Under URL properties, verify the domain that serves the videos (your WordPress media domain).
  - Until TikTok audits the app, posts are **private (SELF_ONLY)**. Submit the audit, then set `TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE`.
- **YouTube**: in Google Cloud, enable *YouTube Data API v3*.
  - *Research*: create an API key → `YOUTUBE_API_KEY`.
  - *Shorts uploads*: create an OAuth client, authorise the MWC channel once with scope `youtube.upload` to get `YOUTUBE_REFRESH_TOKEN`, and set `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`.
  - Uploads stay **private** until the project passes Google's API compliance audit. Then set `YOUTUBE_PRIVACY=public`.
- **Reddit**: create a "script" app at reddit.com/prefs/apps → `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`, and set a descriptive `REDDIT_USER_AGENT`. This is read-only: the system never posts on Reddit.
- **Facebook groups and Instagram accounts** have no search API, so add them under Console → Communities. The system then tracks and scores them with everything else.
- **Google/YouTube ads**: the Ads Transparency Center has no API. Export or copy ads into a CSV and import it under Console → Ad Intelligence → Import CSV.

## 7. Video & site structure
- **Video**: the Docker image includes ffmpeg and fonts. For a voice-over, enable *Cloud Text-to-Speech API* in the same Google Cloud project as the service account and set `VIDEO_TTS=true`. Choose a voice with `VIDEO_TTS_VOICE`.
- **Site structure**: for the AI-built menu to be applied, the WordPress API user needs the **Administrator** role (menus need `edit_theme_options`). Set `WP_MENU_LOCATION` to your theme's main menu location (Appearance → Menus → Manage locations). If the user is only an Editor, categories and post assignments are still applied and the console shows a warning for the menu.

## 8. ClickBank marketplace feed
- `offers.discover` downloads ClickBank's marketplace feed (`CLICKBANK_FEED_URL`) and keeps products with gravity ≥ 5 in relevant categories. If ClickBank stops publishing the feed, the job reports an error. In that case, upload a marketplace export with `POST /api/offers/import`.

## 9. Go-live check
Run `npm test`, then the live scenario in `docs/TESTING.md` with real accounts. Turn on `AUTOMATION_ENABLED=true` only after that passes.
