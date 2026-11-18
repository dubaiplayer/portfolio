/**
 * Request guards for a PUBLIC, UNAUTHENTICATED LLM proxy.
 *
 * ── The control that actually matters is not in this file ──
 * Do not put a credit card on the Groq account. With no payment method the
 * worst case of any abuse below is "chat is unavailable until the daily quota
 * resets". Everything here only reduces how often that happens; none of it can
 * prevent a bill, because there cannot be one. If you ever add a card, re-read
 * this file and assume every limit below is bypassable.
 *
 * Layer 1  cheap rejections, before any upstream call
 * Layer 2  in-memory rate limiting (best-effort — see the comment on limit())
 * Layer 3  graceful degradation, handled by the caller
 */

export const MAX_BODY_BYTES = 8192;
export const MAX_MESSAGES = 12;
export const MAX_MESSAGE_CHARS = 1000;
export const MAX_CONVERSATION_CHARS = 6000;

/* -- Layer 1 --------------------------------------------------------------- */

/**
 * Origin allowlist. Trivially spoofed with curl — no illusions about that.
 * It costs nothing and it does eliminate cross-origin browser abuse and casual
 * embedding of this endpoint in someone else's page, which is most of the
 * unsophisticated traffic.
 */
export function originAllowed(req) {
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Unset means "don't enforce" — keeps local dev and preview deploys working.
  if (!allowed.length) return true;

  const origin = req.headers.origin || '';
  const referer = req.headers.referer || '';
  if (origin) return allowed.includes(origin);
  if (referer) return allowed.some((a) => referer.startsWith(a));
  return false; // same-origin fetch from a browser always sends one of the two
}

/**
 * Narrow prompt-injection / jailbreak heuristics.
 * Deliberately short: a false positive costs a real visitor an answer, which is
 * worse than the wasted call a false negative causes. This is a cheap first
 * filter, not the defence — the actual defence is the nonce fence in prompt.js.
 */
const INJECTION = [
  /ignore\s+(?:all\s+)?(?:your\s+)?previous\s+instructions/i,
  /disregard\s+(?:all\s+)?(?:your\s+)?(?:previous|prior)\s+(?:instructions|rules)/i,
  /you\s+are\s+now\s+(?:a|an|in)\b/i,
  /\b(?:reveal|print|repeat|show)\s+(?:me\s+)?(?:your\s+)?system\s+prompt/i,
  /\bDAN\s+mode\b/i,
  /[A-Za-z0-9+/]{400,}={0,2}/, // long base64 blob
];

export function looksLikeInjection(text) {
  return INJECTION.some((re) => re.test(text));
}

/**
 * Validate and normalise the request body.
 * @returns {{ok:true, messages:object[], pinnedProjectIds:string[]} | {ok:false, status:number, error:string}}
 */
export function validateBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Expected a JSON object.' };
  }

  const { messages, pinnedProjectIds } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, status: 400, error: '`messages` must be a non-empty array.' };
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, status: 400, error: `Too many messages (max ${MAX_MESSAGES}).` };
  }

  let total = 0;
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return { ok: false, status: 400, error: 'Each message needs a role of user/assistant and string content.' };
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return { ok: false, status: 400, error: `Message too long (max ${MAX_MESSAGE_CHARS} characters).` };
    }
    total += m.content.length;
    clean.push({ role: m.role, content: m.content });
  }
  if (total > MAX_CONVERSATION_CHARS) {
    return { ok: false, status: 400, error: 'Conversation too long — start a new chat.' };
  }
  if (clean[clean.length - 1].role !== 'user') {
    return { ok: false, status: 400, error: 'The last message must be from the user.' };
  }

  const pins = Array.isArray(pinnedProjectIds)
    ? pinnedProjectIds.filter((s) => typeof s === 'string' && s.length < 64).slice(0, 5)
    : [];

  return { ok: true, messages: clean, pinnedProjectIds: pins };
}

/* -- Layer 2 --------------------------------------------------------------- */

/**
 * In-memory rate limiting. Per serverless INSTANCE, not global — the Map dies
 * with the instance and is not shared across concurrent ones.
 *
 * What this reliably stops: one client hammering `for i in $(seq 1000); do curl`,
 * which is the overwhelmingly likely abuse of a portfolio endpoint. Portfolio
 * traffic usually keeps a single warm instance, so in practice it holds.
 *
 * What it cannot stop: distributed abuse across many IPs, or an attacker who
 * paces requests slowly enough to land on cold instances. Do not mistake this
 * for a real quota guard — the no-credit-card rule above is the real guarantee.
 *
 * A durable store (Vercel KV / Upstash) is the upgrade if logs ever justify it.
 */
const PER_IP = { max: 8, windowMs: 5 * 60_000 };
const PER_INSTANCE = { max: 200, windowMs: 60 * 60_000 };

const ipHits = new Map();
let instanceHits = [];

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** @returns {{ok:true} | {ok:false, retryAfter:number, scope:'ip'|'instance'}} */
export function limit(req) {
  const now = Date.now();

  // Global instance circuit breaker. Checked first because it does not depend
  // on IP identity, which is the assumption a distributed attack breaks.
  instanceHits = instanceHits.filter((t) => now - t < PER_INSTANCE.windowMs);
  if (instanceHits.length >= PER_INSTANCE.max) {
    const oldest = instanceHits[0];
    return {
      ok: false,
      scope: 'instance',
      retryAfter: Math.ceil((PER_INSTANCE.windowMs - (now - oldest)) / 1000),
    };
  }

  const ip = clientIp(req);
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < PER_IP.windowMs);
  if (hits.length >= PER_IP.max) {
    return {
      ok: false,
      scope: 'ip',
      retryAfter: Math.ceil((PER_IP.windowMs - (now - hits[0])) / 1000),
    };
  }

  hits.push(now);
  ipHits.set(ip, hits);
  instanceHits.push(now);

  // Bound the map so a long-lived instance under spray cannot grow it forever.
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (!v.length || now - v[v.length - 1] > PER_IP.windowMs) ipHits.delete(k);
      if (ipHits.size <= 2500) break;
    }
  }

  return { ok: true };
}

/** Test seam — resets the in-memory counters. */
export function _resetLimits() {
  ipHits.clear();
  instanceHits = [];
}
