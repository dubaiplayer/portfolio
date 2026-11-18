/**
 * Hybrid retrieval: BM25 fused with dense embeddings.
 *
 * BM25 is the floor, not the fallback-of-last-resort. If the embedding API is
 * missing a key, rate-limited, or slow, retrieval degrades to keyword-only and
 * the chatbot keeps answering. That asymmetry is the entire reason this is
 * hybrid rather than dense-only: a dense-only bot with a 429 tells visitors it
 * knows nothing about its owner's projects.
 *
 * Everything below operates on the committed index (api/_data/index.js). There
 * is no vector database — at a few hundred chunks, a linear scan is microseconds.
 */

import indexData from '../_data/index.js';
import { projects } from '../../src/data/projects.js';
import { buildIndex, search, tokenize } from './bm25.js';
import { embedQuery, cosine } from './embed.js';

const TOP_K = 5;
const PER_PROJECT_CAP = 2;

/**
 * Relevance floor, applied to the RAW scores rather than the fused rank score.
 * Reciprocal-rank fusion deliberately throws away magnitude, so a fused score
 * cannot tell "best of five good matches" from "best of five terrible ones" —
 * thresholding it would be a magic number that means nothing.
 *
 * Instead: BM25 returning nothing means no query term appears anywhere in the
 * corpus, and cosine below DENSE_FLOOR means nothing is semantically close.
 * When both are true the honest answer is an empty context.
 */
const DENSE_FLOOR = 0.45;

const BOOST_AUTHORED = 1.6; // hand-written prose outranks scraped README noise
const BOOST_NAMED = 2.0; // the query named this project outright
const BOOST_PINNED = 2.0; // the previous turn was about this project

/**
 * Query-term expansion. Deliberately small and hand-maintained: this covers the
 * specific vocabulary mismatches that actually show up on a developer portfolio,
 * which is most of what a keyword scorer loses to an embedding model here.
 */
const TECH_SYNONYMS = {
  js: ['javascript'],
  javascript: ['js'],
  ts: ['typescript'],
  typescript: ['ts'],
  nextjs: ['next.js', 'next'],
  'next.js': ['nextjs', 'next'],
  nodejs: ['node.js', 'node'],
  'node.js': ['nodejs', 'node'],
  postgres: ['postgresql', 'psql', 'sql'],
  postgresql: ['postgres', 'psql', 'sql'],
  mongo: ['mongodb', 'nosql'],
  mongodb: ['mongo', 'nosql'],
  react: ['reactjs', 'jsx'],
  reactjs: ['react'],
  css: ['styling', 'styles'],
  ml: ['machine', 'learning'],
  ai: ['llm', 'model'],
  llm: ['ai', 'model'],
  rag: ['retrieval', 'embedding', 'embeddings'],
  api: ['endpoint', 'backend', 'server'],
  backend: ['server', 'api'],
  frontend: ['ui', 'client'],
  ui: ['frontend', 'interface'],
  db: ['database'],
  database: ['db'],
  auth: ['authentication', 'login', 'oauth', 'jwt'],
  authentication: ['auth', 'login'],
  deploy: ['deployment', 'hosting', 'vercel'],
  test: ['testing', 'tests'],
  viz: ['visualization', 'visualisation', 'chart'],

  // Domain vocabulary for the projects actually in the catalog. Without these,
  // "is it any good at spotting scam emails?" shares no terms with a chunk that
  // says "phishing classifier".
  phishing: ['scam', 'spam', 'fraud', 'malicious', 'email'],
  scam: ['phishing', 'fraud'],
  email: ['mail', 'inbox', 'message'],
  classifier: ['model', 'classification', 'predict'],
  explainable: ['interpretable', 'explainability', 'transparent', 'evidence'],
  accuracy: ['f1', 'precision', 'recall', 'performance', 'benchmark'],
  sqlite: ['database', 'db', 'storage'],
  agent: ['agents', 'ai', 'autonomous', 'delegation'],
  recommender: ['recommendation', 'recommend', 'suggestions'],
  lyrics: ['song', 'songs', 'music', 'track'],
  music: ['song', 'songs', 'lyrics', 'audio'],
  embedding: ['embeddings', 'vector', 'semantic', 'minilm'],
  embeddings: ['embedding', 'vector', 'semantic'],
  nlp: ['language', 'text', 'linguistic'],
  desktop: ['electron', 'app', 'native'],

  // Person/education vocabulary. tokenize() does not stem, so every surface
  // form a visitor might type has to be listed, and listed in BOTH directions —
  // expand() only walks query terms through this map, it never inverts it.
  study: ['studies', 'studying', 'student', 'university', 'college', 'degree', 'education'],
  studies: ['study', 'studying', 'student', 'university', 'education'],
  studying: ['study', 'studies', 'student', 'degree'],
  student: ['study', 'studies', 'undergraduate', 'university', 'college', 'degree'],
  university: ['college', 'school', 'campus', 'uni', 'education', 'student'],
  college: ['university', 'school', 'education', 'student'],
  school: ['university', 'college', 'education'],
  degree: ['bsc', 'major', 'bachelors', 'undergraduate', 'education'],
  major: ['degree', 'credential', 'specialization'],
  education: ['school', 'university', 'college', 'degree', 'studies', 'student'],
  graduate: ['graduation', 'graduating', 'grad', 'degree'],
  graduation: ['graduate', 'graduating', 'expected', 'finish'],
  graduating: ['graduate', 'graduation'],
  coursework: ['courses', 'course', 'classes', 'class', 'curriculum', 'modules'],
  courses: ['coursework', 'classes', 'curriculum', 'modules'],
  classes: ['courses', 'coursework', 'curriculum'],
  background: ['education', 'experience', 'history', 'studies'],
  experience: ['background', 'work', 'internship', 'job', 'role', 'employment'],
  internship: ['intern', 'experience', 'job', 'placement', 'work'],
};

function expand(terms) {
  const out = new Set(terms);
  for (const t of terms) for (const syn of TECH_SYNONYMS[t] || []) out.add(syn);
  return [...out];
}

/* -- Lazy singletons: built once per warm serverless instance --------------- */

let _bm25 = null;
function bm25Index() {
  if (!_bm25) _bm25 = buildIndex(indexData.chunks);
  return _bm25;
}

let _aliasTable = null;
/** id/title/alias -> projectId, longest phrase first so "flight tracker" beats "flight". */
function aliasTable() {
  if (_aliasTable) return _aliasTable;
  const rows = [];
  for (const p of projects) {
    const names = [p.id, p.title, ...(p.aliases || [])].filter(Boolean);
    for (const n of names) {
      rows.push({ phrase: String(n).toLowerCase().replace(/-/g, ' '), projectId: p.id });
    }
  }
  rows.sort((a, b) => b.phrase.length - a.phrase.length);
  _aliasTable = rows;
  return rows;
}

/** Which projects does this query name outright? */
export function namedProjects(query) {
  const q = ` ${String(query).toLowerCase().replace(/[^a-z0-9+#. ]+/g, ' ').replace(/\s+/g, ' ')} `;
  const hits = new Set();
  for (const { phrase, projectId } of aliasTable()) {
    if (phrase.length < 3) continue;
    if (q.includes(` ${phrase} `)) hits.add(projectId);
  }
  return [...hits];
}

/** Rank-based fusion. Rank-based on purpose: BM25 scores and cosine scores live
 *  on incomparable scales, and normalising them is a source of silent bugs. */
function reciprocalRankFusion(rankings, k = 60) {
  const fused = new Map();
  for (const ranked of rankings) {
    ranked.forEach((id, i) => {
      fused.set(id, (fused.get(id) || 0) + 1 / (k + i + 1));
    });
  }
  return fused;
}

/**
 * @param {string} query           the (possibly concatenated) retrieval query
 * @param {object} opts
 * @param {string[]} opts.pinnedProjectIds  projects cited on the previous turn
 * @param {AbortSignal} opts.signal
 * @returns {Promise<{chunks: object[], usedEmbeddings: boolean}>}
 */
export async function retrieve(query, { pinnedProjectIds = [], signal } = {}) {
  const chunks = indexData.chunks || [];
  if (!chunks.length) return { chunks: [], usedEmbeddings: false };

  const byId = new Map(chunks.map((c) => [c.id, c]));

  /* 1. Lexical */
  const terms = expand(tokenize(query));
  const bmScores = search(bm25Index(), terms);
  const bmRanked = [...bmScores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);

  /* 2. Dense — optional, and never fatal */
  let denseRanked = [];
  let bestCosine = 0;
  let usedEmbeddings = false;
  const haveVectors = chunks.some((c) => c.vector);

  if (haveVectors) {
    const qv = await embedQuery(query, { signal });
    if (qv) {
      usedEmbeddings = true;
      const dense = chunks
        .filter((c) => c.vector)
        .map((c) => [c.id, cosine(qv, c.vector)])
        .sort((a, b) => b[1] - a[1]);
      bestCosine = dense[0]?.[1] ?? 0;
      denseRanked = dense.map(([id]) => id);
    }
  }

  /* 3. Relevance floor — decided on raw scores, before fusion discards them.
        A query that names one of the projects always retrieves, regardless:
        "tell me about the flight tracker" must never come back empty. */
  const named = new Set(namedProjects(query));
  const lexicalHit = bmScores.size > 0;

  if (!named.size && !lexicalHit && bestCosine < DENSE_FLOOR) {
    return { chunks: [], usedEmbeddings };
  }

  /* 4. Fuse and boost */
  const rankings = [bmRanked.slice(0, 40)];
  if (denseRanked.length) rankings.push(denseRanked.slice(0, 40));
  const fused = reciprocalRankFusion(rankings);

  const pinned = new Set(pinnedProjectIds || []);

  const scored = [];
  for (const [id, base] of fused) {
    const c = byId.get(id);
    if (!c) continue;
    let s = base;
    if (c.sourceType === 'authored') s *= BOOST_AUTHORED;
    if (c.projectId && named.has(c.projectId)) s *= BOOST_NAMED;
    if (c.projectId && pinned.has(c.projectId)) s *= BOOST_PINNED;
    scored.push({ chunk: c, score: s });
  }
  scored.sort((a, b) => b.score - a.score);

  /* 5. Per-project diversity cap, then top-k.
        Without this one verbose README monopolises the context window and
        "compare your two React projects" gets evidence for only one of them. */
  const perProject = new Map();
  const picked = [];
  for (const s of scored) {
    if (picked.length >= TOP_K) break;
    /* Profile chunks all carry projectId: null, so a single '__profile__' bucket
       would cap bio + education + experience + every FAQ entry at 2 chunks
       COMBINED — three unrelated sources starving each other. Sub-bucketing by
       heading ('About' | 'Education' | 'Experience' | 'FAQ') makes the cap do
       what it was written for: stop one source monopolising context. Project
       chunks take the projectId branch, so their behaviour is unchanged. */
    const key = s.chunk.projectId || `__profile__:${s.chunk.heading || ''}`;
    const n = perProject.get(key) || 0;
    if (n >= PER_PROJECT_CAP) continue;
    perProject.set(key, n + 1);
    picked.push(s);
  }

  return { chunks: picked.map((p) => p.chunk), usedEmbeddings };
}

/** Exposed for the offline evaluation script. */
export const _internals = { expand, reciprocalRankFusion, aliasTable, TECH_SYNONYMS };
