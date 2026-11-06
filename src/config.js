// Central configuration. Every secret comes from environment variables (or a secrets
// manager that injects them). Nothing secret is stored in the database or source code.
require('dotenv').config();

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const bool = (k, d = false) => { const v = env(k); return v === undefined ? d : /^(1|true|yes|on)$/i.test(v); };
const num = (k, d) => { const v = Number(env(k)); return Number.isFinite(v) ? v : d; };
const list = (k, d = []) => (env(k) ? env(k).split(',').map(s => s.trim()).filter(Boolean) : d);

module.exports = {
  env: env('NODE_ENV', 'development'),
  port: num('PORT', 8080),
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:8080'),
  siteUrl: env('SITE_URL', 'https://mywellnesscommunity.com'),
  siteOrigins: list('SITE_ORIGINS', ['https://mywellnesscommunity.com', 'https://www.mywellnesscommunity.com']),
  db: {
    client: env('DB_CLIENT', 'better-sqlite3'),            // 'pg' in production
    connection: env('DATABASE_URL', './data/mwc360.sqlite'),
  },
  ai: {
    apiKey: env('ANTHROPIC_API_KEY'),
    model: env('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),
    quickModel: env('ANTHROPIC_QUICK_MODEL', 'claude-haiku-5-5'),
    mock: bool('AI_MOCK', false),                          // deterministic answers for tests/demos
  },
  automation: {
    enabled: bool('AUTOMATION_ENABLED', true),
    timezone: env('TZ_SCHEDULE', 'Europe/London'),
    shortlistScore: num('SHORTLIST_SCORE', 70),            // AI may shortlist at or above this; never beyond
    rejectScore: num('AUTO_REJECT_SCORE', 25),             // below this AI marks "Rejected (AI)" for human review
    autoPublishInformational: bool('AUTO_PUBLISH_INFORMATIONAL', false), // offer content is ALWAYS human-approved
    adKeywords: list('AD_KEYWORDS', ['joint supplement', 'dog joint', 'magnesium', 'gut health', 'probiotic for dogs', 'collagen', 'sleep supplement', 'cat food']),
    adCountries: list('AD_COUNTRIES', ['DE', 'FR', 'NL', 'IE']),   // Meta Ad Library returns all ad types only for EU countries
    discoveryCountries: list('DISCOVERY_COUNTRIES', ['US', 'GB', 'DE']),
    chatIdleMinutes: num('CHAT_IDLE_MINUTES', 20),
    communityKeywords: list('COMMUNITY_KEYWORDS', ['dog health', 'senior dogs', 'cat health', 'pet nutrition', 'supplements', 'gut health', 'sleep', 'joint pain', 'healthy aging']),
    tiktokAdCountries: list('TIKTOK_AD_COUNTRIES', ['DE', 'FR', 'NL', 'IE']),
  },
  video: {
    ffmpeg: env('FFMPEG_PATH', 'ffmpeg'),
    width: num('VIDEO_WIDTH', 1080), height: num('VIDEO_HEIGHT', 1920),
    tts: bool('VIDEO_TTS', false),                           // Google Cloud Text-to-Speech voice-over
    ttsVoice: env('VIDEO_TTS_VOICE', 'en-GB-Neural2-C'),
  },
  connectors: {
    awin: { token: env('AWIN_API_TOKEN'), publisherId: env('AWIN_PUBLISHER_ID') },
    clickbank: { apiKey: env('CLICKBANK_API_KEY'), account: env('CLICKBANK_ACCOUNT'), feedUrl: env('CLICKBANK_FEED_URL', 'https://accounts.clickbank.com/feeds/marketplace_feed_v2.xml.zip'), feedEnabled: bool('CLICKBANK_FEED_ENABLED', true) },
    digistore24: { apiKey: env('DIGISTORE24_API_KEY') },
    impact: { accountSid: env('IMPACT_ACCOUNT_SID'), authToken: env('IMPACT_AUTH_TOKEN') },
    wordpress: { baseUrl: env('WP_BASE_URL', 'https://mywellnesscommunity.com'), user: env('WP_USER'), appPassword: env('WP_APP_PASSWORD'), menuLocation: env('WP_MENU_LOCATION', 'primary') },
    mailerlite: { apiKey: env('MAILERLITE_API_KEY'), webhookSecret: env('MAILERLITE_WEBHOOK_SECRET') },
    meta: {
      accessToken: env('META_ACCESS_TOKEN'),                // Ad Library (needs identity-verified app)
      pageId: env('META_PAGE_ID'), pageToken: env('META_PAGE_TOKEN'),
      igUserId: env('META_IG_USER_ID'),
      graphVersion: env('META_GRAPH_VERSION', 'v21.0'),
    },
    pinterest: { token: env('PINTEREST_TOKEN'), boardId: env('PINTEREST_BOARD_ID') },
    tiktok: {
      clientKey: env('TIKTOK_CLIENT_KEY'), clientSecret: env('TIKTOK_CLIENT_SECRET'),
      researchEnabled: bool('TIKTOK_ADLIB_ENABLED', false),   // Commercial Content API access approved
      refreshToken: env('TIKTOK_REFRESH_TOKEN'),               // MWC TikTok account (video.publish scope)
      privacyLevel: env('TIKTOK_PRIVACY_LEVEL', 'PUBLIC_TO_EVERYONE'), // unaudited apps: SELF_ONLY
    },
    youtube: {
      apiKey: env('YOUTUBE_API_KEY'),                          // channel search (communities)
      clientId: env('YOUTUBE_CLIENT_ID'), clientSecret: env('YOUTUBE_CLIENT_SECRET'), refreshToken: env('YOUTUBE_REFRESH_TOKEN'),
      privacy: env('YOUTUBE_PRIVACY', 'public'),               // unverified API projects: private
    },
    reddit: { clientId: env('REDDIT_CLIENT_ID'), clientSecret: env('REDDIT_CLIENT_SECRET'), userAgent: env('REDDIT_USER_AGENT', 'web:mwc360-research:1.0 (by /u/mywellnesscommunity)') },
    google: {
      serviceAccountJson: env('GOOGLE_SERVICE_ACCOUNT_JSON'),  // path or inline JSON
      ga4PropertyId: env('GA4_PROPERTY_ID'),
      gscSiteUrl: env('GSC_SITE_URL', 'sc-domain:mywellnesscommunity.com'),
    },
  },
  security: {
    bootstrapAdminToken: env('BOOTSTRAP_ADMIN_TOKEN'),     // one-time: create first admin, then remove
    ipHashSalt: env('IP_HASH_SALT', 'change-me'),
  },
};
