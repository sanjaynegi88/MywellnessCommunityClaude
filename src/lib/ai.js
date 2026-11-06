// AI layer: one place where the platform talks to Claude (Anthropic Messages API).
// `task` names every call so behaviour, cost and logs can be tracked per use case,
// and so AI_MOCK mode can return deterministic answers in tests and demos.
const config = require('../config');
const log = require('../logger');
const mock = require('./aiMock');

const BRAND_RULES = `You work for My Wellness Community (MWC, mywellnesscommunity.com), an affiliate marketing business for human wellness (nutraceuticals/supplements) and pet wellness/pet food, targeting the USA, UK and selected European markets.
Hard rules:
- Never invent reviews, testimonials, customer experiences, ratings, prices, studies or clinical evidence.
- Never claim a supplement cures, treats or prevents a disease. No diagnoses. Suggest a doctor or vet for health concerns.
- Mark any fact that needs human verification as [VERIFY].
- Content that promotes an offer starts with an affiliate disclosure.
- Respect platform terms of service; do not copy competitors' text, images, branding or code.`;

let client = null;
function getClient() {
  if (!client) {
    if (!config.ai.apiKey) throw Object.assign(new Error('ANTHROPIC_API_KEY is not set'), { status: 503 });
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: config.ai.apiKey });
  }
  return client;
}

/**
 * @param {string} task      e.g. 'offer.score'
 * @param {string|Array<{role,content}>} input
 * @param {{tier?:'default'|'quick', system?:string, maxTokens?:number, context?:any}} opts
 */
async function complete(task, input, { tier = 'default', system = BRAND_RULES, maxTokens = 4000, context } = {}) {
  const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : mergeTurns(input);
  if (config.ai.mock) return mock.text(task, messages, context);
  const started = Date.now();
  const res = await getClient().messages.create({
    model: tier === 'quick' ? config.ai.quickModel : config.ai.model,
    max_tokens: maxTokens, system, messages,
  });
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  log.info({ task, ms: Date.now() - started, inTok: res.usage?.input_tokens, outTok: res.usage?.output_tokens }, 'ai call');
  return text;
}

/** Same as complete() but parses one JSON value from the reply. */
async function json(task, prompt, opts = {}) {
  if (config.ai.mock) return mock.json(task, prompt, opts.context);
  const text = await complete(task, prompt + '\n\nReply with only the JSON value, no other text.', opts);
  return parseJson(text);
}

function parseJson(text) {
  const candidates = [text, (text.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1]];
  const s = Math.min(...['{', '['].map(c => { const i = text.indexOf(c); return i < 0 ? Infinity : i; }));
  const e = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (Number.isFinite(s) && e > s) candidates.push(text.slice(s, e + 1));
  for (const c of candidates) { if (!c) continue; try { return JSON.parse(c); } catch (_) { /* next */ } }
  throw Object.assign(new Error('AI reply was not valid JSON'), { status: 502, raw: text.slice(0, 1000) });
}

function mergeTurns(turns) {
  const out = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += '\n\n' + t.content; else out.push({ role: t.role, content: String(t.content) });
  }
  if (out[0]?.role !== 'user') out.unshift({ role: 'user', content: '(conversation start)' });
  return out;
}

module.exports = { complete, json, parseJson, BRAND_RULES };
