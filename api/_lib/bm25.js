/**
 * Okapi BM25 over the chunk corpus.
 *
 * Statistics (document frequency, average length) are built at cold start
 * rather than baked into the committed index. 200 chunks tokenize in a couple
 * of milliseconds, it halves the index file, and — the real reason — it means
 * there is exactly ONE tokenizer, used by both ingest and query. Precomputing
 * df at ingest time is how the two drift apart and retrieval silently rots.
 */

const K1 = 1.2; // term-frequency saturation
const B = 0.75; // length normalisation

/** Words that carry no signal in a corpus that is entirely about one person's projects. */
const STOP = new Set(
  `a an and are as at be by for from has have how i in is it its of on or that the this to was what
   when where which who why with you your he she they i'm what's did do does done about tell me
   more can could would should show us our their there here into over under`.split(/\s+/)
);

/**
 * The single tokenizer. Lowercase, split on non-alphanumerics but keep intra-word
 * `.`, `+` and `#` so "next.js", "c++" and "c#" survive as single terms, then
 * strip any leftover trailing punctuation.
 */
export function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9.+#_-]+/)
    // Strip only .-_ from the edges; '+' and '#' must survive so "c++" and "c#"
    // stay intact rather than collapsing to a one-character token that gets filtered.
    .map((t) => t.replace(/^[._-]+|[._-]+$/g, ''))
    .filter((t) => t.length > 1 && t.length < 40 && !STOP.has(t) && !/^\d+$/.test(t));
}

/**
 * Build the corpus statistics. Cheap enough to run per cold start.
 * @param {{id:string, text:string}[]} chunks
 */
export function buildIndex(chunks) {
  const docs = chunks.map((c) => {
    const terms = tokenize(c.text);
    const tf = new Map();
    for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    return { id: c.id, tf, len: terms.length };
  });

  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);

  const avgdl = docs.reduce((s, d) => s + d.len, 0) / (docs.length || 1);
  return { docs, df, avgdl, N: docs.length };
}

/**
 * Score every document against the query terms.
 * @returns {Map<string, number>} chunk id -> BM25 score (unnormalised)
 */
export function search(index, queryTerms) {
  const { docs, df, avgdl, N } = index;
  const scores = new Map();

  // Deduplicate so a term repeated in the query doesn't double-count.
  const terms = [...new Set(queryTerms)];

  for (const term of terms) {
    const n = df.get(term);
    if (!n) continue;
    // Standard BM25 IDF with the +1 guard that keeps it non-negative for
    // terms appearing in more than half the corpus.
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));

    for (const d of docs) {
      const f = d.tf.get(term);
      if (!f) continue;
      const norm = f * (K1 + 1) / (f + K1 * (1 - B + B * (d.len / avgdl)));
      scores.set(d.id, (scores.get(d.id) || 0) + idf * norm);
    }
  }

  return scores;
}
