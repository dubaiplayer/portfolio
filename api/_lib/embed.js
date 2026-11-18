/**
 * Embedding client — Google `gemini-embedding-001` over plain fetch.
 *
 * Used at BOTH ends of the pipeline (ingest embeds chunks, the chat function
 * embeds the incoming question), which is why it lives in api/_lib and not in
 * scripts/: the two must use the same model, the same dimensionality and the
 * same normalisation, or cosine similarity is meaningless.
 *
 * Everything here is best-effort by design. If the key is missing or the free
 * tier rate-limits, callers fall back to BM25-only retrieval rather than
 * failing the request — see api/_lib/retrieve.js.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
export const EMBED_MODEL = 'gemini-embedding-001';

/**
 * 768 instead of the model's native 3072: the index is committed to git and
 * shipped inside the serverless bundle, so a 4x smaller vector is worth far
 * more than the marginal recall. Truncated outputs are NOT normalised by the
 * API, so we normalise ourselves below — skipping that quietly breaks cosine.
 */
export const EMBED_DIM = 768;

function l2normalize(v) {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (!norm) return v;
  return v.map((x) => x / norm);
}

/** Cosine similarity for already-normalised vectors (i.e. a plain dot product). */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function hasEmbeddingKey() {
  return Boolean(process.env.EMBED_API_KEY);
}

/**
 * Embed a batch of texts.
 * @param {string[]} texts
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 *   Asymmetric task types measurably improve retrieval — documents and queries
 *   get projected differently on purpose. Don't collapse these to one value.
 * @returns {Promise<number[][]|null>} null when embeddings are unavailable.
 */
export async function embedBatch(texts, taskType = 'RETRIEVAL_DOCUMENT', { signal } = {}) {
  const key = process.env.EMBED_API_KEY;
  if (!key || texts.length === 0) return null;

  const res = await fetch(`${ENDPOINT}/${EMBED_MODEL}:batchEmbedContents`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIM,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`embed ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  return (json.embeddings || []).map((e) => l2normalize(e.values || []));
}

/** Convenience wrapper for the single-query case. Returns null on any failure. */
export async function embedQuery(text, { signal } = {}) {
  try {
    const out = await embedBatch([text], 'RETRIEVAL_QUERY', { signal });
    return out?.[0] || null;
  } catch (err) {
    // Deliberately swallowed: a rate-limited embedding API must degrade to
    // BM25-only retrieval, never brick the chatbot.
    console.warn('[embed] query embedding unavailable, falling back to BM25:', err.message);
    return null;
  }
}
