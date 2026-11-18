/**
 * POST /api/chat — the portfolio chatbot endpoint.
 *
 * Vercel Node function. `package.json` has "type": "module", so this is ESM and
 * the handler must be a default export, not module.exports.
 *
 * Request   { messages: [{role, content}], pinnedProjectIds?: string[] }
 * Responses 200 { answer, sources, pinnedProjectIds }
 *           400 { error }                     malformed / oversized
 *           403 { error }                     origin not allowed
 *           429 { error, retryAfter }         rate limited (ours or upstream)
 *           503 { error, fallback }           upstream down / not configured
 *
 * Returns a single JSON body rather than SSE. Vercel Hobby now allows 300s so
 * there is no timeout argument for streaming, and gpt-oss-120b returns a
 * 400-token answer in well under a second. Streaming would cost the ability to
 * return a clean 429/503 once headers are written — and on this free tier, 429
 * is a normal code path, not an exceptional one. The widget sniffs Content-Type
 * and already handles both, so turning on streaming later is a change in
 * _lib/llm.js alone.
 */

import { retrieve } from './_lib/retrieve.js';
import { buildSystemPrompt, extractCitedProjects, buildSources } from './_lib/prompt.js';
import { chatCompletion, llmConfigured, LlmError } from './_lib/llm.js';
import {
  originAllowed,
  validateBody,
  looksLikeInjection,
  limit,
  MAX_BODY_BYTES,
} from './_lib/guard.js';
import { profile } from '../src/data/profile.js';

/** History kept per request. Small on purpose: see the token budget in the plan. */
const HISTORY_TURNS = 6; // 3 exchanges
const REPLAY_TRUNCATE = 500;

const FALLBACK_CONTACT = {
  github: profile.links?.github || null,
  email: profile.email || null,
};

function send(res, status, payload) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed.' });
  }

  /* -- Layer 1: cheap rejections, before any upstream call ----------------- */

  if (!originAllowed(req)) {
    return send(res, 403, { error: 'Not allowed from this origin.' });
  }

  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return send(res, 400, { error: 'Request body too large.' });
  }

  const parsed = validateBody(req.body);
  if (!parsed.ok) {
    return send(res, parsed.status, { error: parsed.error });
  }

  const { messages, pinnedProjectIds } = parsed;
  const question = messages[messages.length - 1].content;

  // Canned refusal at zero upstream cost.
  if (looksLikeInjection(question)) {
    return send(res, 200, {
      answer:
        `I'm just here to talk about ${profile.name.split(' ')[0]}'s projects and experience — ` +
        `ask me what he's built and I'll dig in.`,
      sources: [],
      pinnedProjectIds: [],
    });
  }

  /* -- Layer 2: rate limiting ---------------------------------------------- */

  const rl = limit(req);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return send(res, 429, {
      error:
        rl.scope === 'ip'
          ? 'Too many questions right now — give it a moment.'
          : 'The chat is busy right now — try again shortly.',
      retryAfter: rl.retryAfter,
    });
  }

  if (!llmConfigured()) {
    return send(res, 503, {
      error: 'The chat is not configured yet.',
      fallback: FALLBACK_CONTACT,
    });
  }

  /* -- Retrieval ----------------------------------------------------------- */

  /* Follow-ups like "how did you build it?" carry no content terms of their own.
     Concatenating the previous user turn restores them, which resolves the
     pronoun cases without the second LLM call a query-rewriter would cost —
     at 8k tokens/minute, doubling the request count to fix this is a bad trade. */
  const priorUser = [...messages].reverse().find((m, i) => i > 0 && m.role === 'user');
  const retrievalQuery = priorUser ? `${priorUser.content} ${question}` : question;

  let chunks = [];
  let usedEmbeddings = false;
  try {
    const r = await retrieve(retrievalQuery, { pinnedProjectIds });
    chunks = r.chunks;
    usedEmbeddings = r.usedEmbeddings;
  } catch (err) {
    // Retrieval must never take the request down — the catalog and profile in
    // the system prompt can still answer a great deal on their own.
    console.error('[chat] retrieval failed, continuing with catalog only:', err.message);
  }

  /* -- Prompt -------------------------------------------------------------- */

  const { system } = buildSystemPrompt(chunks);

  const history = messages.slice(-HISTORY_TURNS).map((m) => ({
    role: m.role,
    content:
      m.role === 'assistant' && m.content.length > REPLAY_TRUNCATE
        ? `${m.content.slice(0, REPLAY_TRUNCATE)}...`
        : m.content,
  }));

  /* -- Upstream ------------------------------------------------------------ */

  let answer;
  try {
    answer = await chatCompletion([{ role: 'system', content: system }, ...history]);
  } catch (err) {
    if (err instanceof LlmError) {
      if (err.kind === 'rate_limit') {
        res.setHeader('Retry-After', String(err.retryAfter));
        return send(res, 429, {
          error: 'Too many questions right now — try again in a moment.',
          retryAfter: err.retryAfter,
        });
      }
      console.error(`[chat] llm ${err.kind}:`, err.message);
      return send(res, 503, {
        error: 'The chat is taking a break — here are the direct links instead.',
        fallback: FALLBACK_CONTACT,
      });
    }
    console.error('[chat] unexpected:', err);
    return send(res, 503, {
      error: 'Something broke on my end.',
      fallback: FALLBACK_CONTACT,
    });
  }

  /* -- Citations ----------------------------------------------------------- */

  const cited = extractCitedProjects(answer, chunks);

  return send(res, 200, {
    answer,
    sources: buildSources(cited),
    pinnedProjectIds: cited,
    // Surfaced for debugging/eval; harmless to expose.
    meta: { usedEmbeddings, contextChunks: chunks.length },
  });
}
