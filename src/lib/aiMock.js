// Deterministic AI answers used when AI_MOCK=1 (automated tests, demos without an API key).
// Each task returns the same shape the real model is asked for.
const lastUser = (messages) => [...messages].reverse().find(m => m.role === 'user')?.content || '';

const JSON_BY_TASK = {
  'offer.score': (p) => ({ score: /joint|senior|gut|magnesium/i.test(p) ? 82 : 55, demandFit: 'Matches recorded customer needs [mock]', customerNeed: 'Stated in chatbot sessions [mock]', reputation: '[VERIFY]', terms: '[VERIFY]', trafficFit: 'Content/SEO allowed [VERIFY]', contentOpportunities: 'Review, comparison, buying guide', risks: 'Claims must be verified', missingInfo: 'Commission, permitted traffic', recommendation: 'Shortlist' }),
  'ads.classify': () => ({ hook: 'Is your dog slowing down?', pain: 'Joint stiffness', trigger: 'Love for pet', story: 'Problem → solution', cta: 'Learn more', landing: 'Advertorial', format: 'Static image' }),
  'competitor.analyse': () => ({ features: ['Need-based navigation', 'Comparison tables', 'Buying guides', 'Email popup'], gaps: 'Few UK pet nutrition guides', recommendations: [{ title: 'Add need-based navigation', effort: 'M', why: 'Common across competitors' }] }),
  'research.synthesise': () => ([{ text: 'Senior pet joint care shows repeated demand', kind: 'Trend', priority: 'High', module: 'offers' }]),
  'chat.extract': () => ({ summary: 'Visitor has an older dog with stiff joints', vertical: 'Pet', country: 'UK', interests: ['joint care', 'senior dogs'], needs: ['stiff older dog'], questions: ['What helps an older dog with stiff joints?'], preferences: ['chews'], unmetNeeds: ['UK-available joint chew'], suggestions: [], engagement: 60 }),
  'learning.cycle': () => ([
    { text: 'Create a buying guide for senior dog joint support', why: 'Chatbot needs + research trend + active offer', kind: 'Recommendation', module: 'content', priority: 'High', action: { type: 'content.idea', title: 'Best joint support for senior dogs: buying guide', contentType: 'Buying guide', vertical: 'Pet', keywords: 'senior dog joint supplement' } },
    { text: 'Search networks for UK-available pet joint products', why: 'Unmet need from UK visitors', kind: 'Need', module: 'offers', priority: 'Medium', action: { type: 'discovery.keyword', keyword: 'dog joint' } },
  ]),
  'content.plan': () => ([{ title: 'How to support an older dog\'s joints', type: 'Educational blog', vertical: 'Pet', keywords: 'senior dog joints', why: 'Recurring chatbot question' }]),
  'social.repurpose': () => ([
    { platform: 'Facebook', format: 'Post', caption: 'Is your older dog slowing down? Read our guide. [mock]' },
    { platform: 'Instagram', format: 'Post', caption: 'Senior dog joint care tips [mock]' },
    { platform: 'Pinterest', format: 'Pin', caption: 'Senior dog joint care guide [mock]' },
    { platform: 'TikTok', format: 'Video', caption: 'Hook: Is your dog slowing down? [mock script]' },
    { platform: 'YouTube', format: 'Reel/Short', caption: 'Hook: 3 signs your dog has stiff joints [mock script]' },
  ]),
  'video.scenes': () => ({ scenes: [{ onScreen: 'Is your dog slowing down?', voiceover: 'Is your dog slowing down?', seconds: 2 }, { onScreen: 'Stiff joints are common in older dogs', sub: 'Talk to your vet first', voiceover: 'Stiff joints are common in older dogs.', seconds: 2 }, { onScreen: 'Read the full guide', sub: 'mywellnesscommunity.com', voiceover: 'Read the full guide at my wellness community dot com.', seconds: 2 }], caption: 'Senior dog joint care guide', hashtags: ['dogsoftiktok', 'seniordog'] }),
  'communities.rank': (p) => [...String(p).matchAll(/"key":"([^"]+)"/g)].map((m, i) => ({ key: m[1], relevance: i === 0 ? 88 : 40, vertical: 'Pet', audienceNeeds: 'Older dogs with mobility problems', approach: 'listen', rules: 'No self-promotion' })),
  'structure.propose': () => ({ categories: [{ name: 'Senior dog care', slug: 'senior-dog-care', parent: '', kind: 'need', description: 'Help for older dogs' }, { name: 'Joint health', slug: 'joint-health', parent: 'senior-dog-care', kind: 'need' }, { name: 'Dog supplements', slug: 'dog-supplements', parent: '', kind: 'technical' }],
    menu: [{ title: 'Senior dogs', categorySlug: 'senior-dog-care', children: [{ title: 'Joints', categorySlug: 'joint-health' }] }, { title: 'Supplements', categorySlug: 'dog-supplements' }, { title: 'About', url: '/about/' }],
    assignments: [{ contentTitle: 'PetJoint Co Senior Dog Joint Chews review', categorySlugs: ['joint-health', 'dog-supplements'] }],
    homepageSections: [{ title: 'Find help by need', purpose: 'Need-based entry points' }], categoryPages: [{ categorySlug: 'joint-health', title: 'Dog joint health hub', purpose: 'Landing page for joint needs' }], internalLinks: [], rationale: 'mock' }),
  'creative.copy': () => ({ headline: 'Keep your senior dog moving', sub: 'Our joint-care buying guide', cta: 'Read the guide' }),
  'email.draft': () => ({ subject: 'Helping your older dog stay active', preview: 'A simple guide from MWC', html: '<p>Hi {$name},</p><p>Here is our guide to senior dog joint care. [mock]</p>' }),
};

module.exports = {
  text(task, messages, context) {
    const u = lastUser(messages);
    if (task === 'chat.reply') return /email|tips/i.test(u) ? 'You can use the form below to get our tips by email.' : 'Thanks for sharing. How old is your dog, and which country are you in?';
    if (task === 'content.generate') return `Affiliate disclosure: MWC may earn a commission.\n\n## ${context?.title || 'Guide'}\n\nMock draft content. [VERIFY] product facts.\n\n## FAQ\n\nQ: Is it safe? A: Ask your vet.\n\nMeta description: mock.`;
    if (task === 'content.compliance') return 'No disallowed claims found. [mock]';
    if (task === 'contact.profile') return 'Pet owner in the UK interested in senior dog joint care. [mock]';
    return `Mock answer for ${task}.`;
  },
  json(task, prompt, context) {
    const f = JSON_BY_TASK[task];
    if (!f) return { ok: true, task };
    return f(prompt, context);
  },
};
