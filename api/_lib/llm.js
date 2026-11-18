/**
 * OpenAI-compatible chat client over plain fetch.
 *
 * No SDK on purpose. Groq, Together, OpenRouter, Cerebras, Fireworks and a local
 * Ollama all speak this same wire format, so "swap the provider" is two env vars
 * rather than a dependency change — which is exactly the requirement. It is also
 * ~40 lines with no supply-chain surface.
 *
 * Env:
 *   LLM_API_KEY   required
 *   LLM_BASE_URL  default https://api.groq.com/openai/v1
 *   LLM_MODEL     default openai/gpt-oss-120b
 */

const DEFAULT_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

/** Hard server-side caps. Deliberately NOT configurable from the request body:
 *  a client-controlled max_tokens is the single biggest quota-drain vector. */
export const MAX_OUTPUT_TOKENS = 512;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 30_000;

export class LlmError extends Error {
  constructor(kind, message, { status, retryAfter } = {}) {
    super(message);
    this.kind = kind; // 'rate_limit' | 'auth' | 'upstream' | 'timeout' | 'empty'
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function llmConfigured() {
  return Boolean(process.env.LLM_API_KEY);
}

/**
 * @param {{role:'system'|'user'|'assistant', content:string}[]} messages
 * @returns {Promise<string>} the assistant's reply text
 */
export async function chatCompletion(messages, { signal } = {}) {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new LlmError('auth', 'LLM_API_KEY is not set');

  const base = process.env.LLM_BASE_URL || DEFAULT_BASE;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const timer = new AbortController();
  const t = setTimeout(() => timer.abort(), TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => timer.abort(), { once: true });

  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: timer.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
        stream: false,
      }),
    });
  } catch (err) {
    throw new LlmError('timeout', `LLM request failed: ${err.message}`);
  } finally {
    clearTimeout(t);
  }

  if (res.status === 429) {
    // Expected in normal operation on the free tier, not an exceptional case.
    throw new LlmError('rate_limit', 'Upstream rate limit', {
      status: 429,
      retryAfter: Number(res.headers.get('retry-after')) || 30,
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw new LlmError('auth', 'LLM rejected the API key', { status: res.status });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new LlmError('upstream', `LLM ${res.status}: ${body.slice(0, 200)}`, { status: res.status });
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new LlmError('empty', 'LLM returned an empty completion');
  return text;
}
