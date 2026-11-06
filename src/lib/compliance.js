// Rule-based content compliance checks that run on every draft before AI review and human approval.
const PATTERNS = [
  ['disease claim', /\b(cures?|treats?|heals?|prevents?)\b[^.]{0,60}\b(disease|cancer|diabetes|arthritis|infection|anxiety disorder|depression|dementia)\b/i],
  ['cure language', /\b(cure|cures|miracle|wonder pill)\b/i],
  ['guarantee', /\bguarantee(d)?\b[^.]{0,40}\b(results?|weight loss|relief)\b/i],
  ['regulatory claim', /\b(fda|mhra|ema)[- ]approved\b/i],
  ['clinically proven', /\bclinically (proven|tested)\b/i],
  ['absolute safety', /\b(100% safe|no side effects|completely safe)\b/i],
  ['weight-loss figure', /\blose \d+\s?(lbs?|pounds|kg|kilos)\b/i],
  ['fake testimonial marker', /\b(verified (buyer|customer)|5 stars from)\b/i],
];
function check(text, { promotesOffer = false } = {}) {
  const t = String(text || '');
  const flags = PATTERNS.filter(([, re]) => re.test(t)).map(([name]) => name);
  if (promotesOffer && !/affiliate|commission/i.test(t.slice(0, 600))) flags.push('missing affiliate disclosure');
  const verifyCount = (t.match(/\[VERIFY\]/g) || []).length;
  return { flags, verifyCount, clean: flags.length === 0 };
}
module.exports = { check };
