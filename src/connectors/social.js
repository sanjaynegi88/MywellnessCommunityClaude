// Social platforms through their official APIs only.
//  - Meta Ad Library API (ads_archive): research of ads. Requires an identity-verified Meta developer app.
//    All ad types are only returned for ads reaching EU countries (DSA); elsewhere only political/issue ads.
//  - Facebook Page posts & Instagram content publishing: Graph API with a Page access token.
//  - Pinterest API v5: create Pins.
//  YouTube and TikTok uploads need app review/audits; until approved, posts for those platforms
//  are produced as "Ready" packages for manual upload (status Ready, never faked as Posted).
const { request } = require('../lib/http');
const config = require('../config');
const meta = config.connectors.meta;
const pin = config.connectors.pinterest;
const G = () => `https://graph.facebook.com/${meta.graphVersion}`;

const adLibrary = {
  configured: () => !!meta.accessToken,
  async search(term, countries) {
    const r = await request(`${G()}/ads_archive`, { query: {
      access_token: meta.accessToken, search_terms: term, ad_reached_countries: countries, ad_type: 'ALL', ad_active_status: 'ACTIVE', limit: 50,
      fields: 'id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_delivery_start_time,ad_snapshot_url,publisher_platforms,languages',
    } });
    return (r?.data || []).map(a => ({
      extKey: `metaad:${a.id}`, brand: a.page_name, platform: 'Meta (FB/IG)',
      text: [...(a.ad_creative_bodies || []), ...(a.ad_creative_link_titles || [])].join('\n').slice(0, 2000),
      startedAt: a.ad_delivery_start_time, source: a.ad_snapshot_url, placements: a.publisher_platforms, languages: a.languages,
    }));
  },
};

const facebook = {
  configured: () => !!(meta.pageId && meta.pageToken),
  async post({ message, link }) { return request(`${G()}/${meta.pageId}/feed`, { method: 'POST', query: { access_token: meta.pageToken }, json: { message, link } }); },
  async insights(postId) {
    const r = await request(`${G()}/${postId}/insights`, { query: { access_token: meta.pageToken, metric: 'post_impressions_unique,post_clicks' } });
    const v = (name) => (r?.data || []).find(x => x.name === name)?.values?.[0]?.value || 0;
    return { reach: v('post_impressions_unique'), clicks: v('post_clicks') };
  },
};

const instagram = {
  configured: () => !!(meta.igUserId && meta.pageToken),
  async post({ caption, imageUrl }) {
    if (!imageUrl) throw new Error('Instagram needs a public image URL');
    const container = await request(`${G()}/${meta.igUserId}/media`, { method: 'POST', query: { access_token: meta.pageToken }, json: { image_url: imageUrl, caption } });
    return request(`${G()}/${meta.igUserId}/media_publish`, { method: 'POST', query: { access_token: meta.pageToken }, json: { creation_id: container.id } });
  },
  async insights(mediaId) {
    const r = await request(`${G()}/${mediaId}/insights`, { query: { access_token: meta.pageToken, metric: 'reach,total_interactions' } });
    const v = (name) => (r?.data || []).find(x => x.name === name)?.values?.[0]?.value || 0;
    return { reach: v('reach'), engagement: v('total_interactions') };
  },
};

const pinterest = {
  configured: () => !!(pin.token && pin.boardId),
  async post({ title, description, link, imageUrl }) {
    return request('https://api.pinterest.com/v5/pins', { method: 'POST', headers: { Authorization: `Bearer ${pin.token}` }, json: {
      board_id: pin.boardId, title: String(title || '').slice(0, 100), description: String(description || '').slice(0, 500), link,
      media_source: { source_type: 'image_url', url: imageUrl },
    } });
  },
};

/** Registry: add new platforms here without changing the rest of the system. */
const tiktok = require('./tiktok');
const youtube = require('./youtube');
const publishers = {
  Facebook: facebook, Instagram: instagram, Pinterest: pinterest,
  TikTok: { configured: tiktok.poster.configured, needsVideo: true, post: ({ caption, videoUrl }) => tiktok.poster.post({ caption, videoUrl }) },
  YouTube: { configured: youtube.uploader.configured, needsVideo: true, post: ({ caption, title, videoFile }) => youtube.uploader.upload({ filePath: videoFile, title: `${title} #Shorts`, description: caption, tags: ['wellness', 'MWC'] }), insights: (id) => youtube.uploader.stats(id) },
};

module.exports = { adLibrary, facebook, instagram, pinterest, publishers };
