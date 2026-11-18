#!/usr/bin/env node
/**
 * Build the RAG index from src/data/projects.js + src/data/profile.js.
 *
 *   yarn ingest          fetch (using the cache), chunk, embed, write the index
 *   yarn ingest:force    ignore the cache and refetch/re-embed everything
 *   yarn ingest:check    validate + report only; never writes
 *
 * Output: api/_data/index.js, committed to git.
 *
 * This deliberately does NOT run during `yarn build`. Running it on Vercel
 * would put a GITHUB_TOKEN in the build environment, make every deploy fail on
 * a transient network error, and burn API quota on every push. The index is a
 * committed artifact; re-run this locally when project data changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';

import { projects } from '../src/data/projects.js';
import { unclaimedTech, unevidencedSkills } from '../src/data/expertise.js';
import { profile, eduRange } from '../src/data/profile.js';
import { embedBatch, EMBED_MODEL, EMBED_DIM, hasEmbeddingKey } from '../api/_lib/embed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_PATH = path.join(ROOT, 'scripts', '.ingest-cache.json');
const OUT_PATH = path.join(ROOT, 'api', '_data', 'index.js');

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');

const CHUNK_TARGET = 900; // chars, about 220 tokens
const CHUNK_OVERLAP = 150;
const CHUNK_MAX = 1200;
const CHUNK_MIN = 200;

let warnings = 0;
const log = (...a) => console.log(...a);
const warn = (...a) => { warnings++; console.warn('  !', ...a); };

/* -- Load .env.local so GITHUB_TOKEN / EMBED_API_KEY work without a shell export -- */
function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

/* -- Validation ------------------------------------------------------------ */

/**
 * projects.js and profile.js are imported by Node, by the Vercel function and
 * by React. A single Vite asset import in either breaks two of those three, and
 * it breaks them at runtime rather than at edit time - so check it explicitly.
 */
function assertNodeSafe() {
  const problems = [];
  const DATA_MODULES = [
    'src/data/projects.js',
    'src/data/profile.js',
    'src/data/suggestions.js',
    'src/data/expertise.js',
  ];
  for (const rel of DATA_MODULES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/^\s*import\s+[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (/\.(png|jpe?g|gif|svg|webp|css|scss)$/i.test(m[1])) {
        problems.push(`${rel} imports the asset "${m[1]}" - Node cannot load this.`);
      }
    }
    if (/import\.meta\.(env|glob|hot)/.test(src)) {
      problems.push(`${rel} uses import.meta.* - that is Vite-only and breaks ingest.`);
    }
  }
  return problems;
}

function validate() {
  const problems = [...assertNodeSafe()];
  const seen = new Set();

  for (const p of projects) {
    const where = `project "${p.id || '(missing id)'}"`;
    if (!p.id) problems.push('A project is missing `id`.');
    else if (seen.has(p.id)) problems.push(`Duplicate project id "${p.id}".`);
    else seen.add(p.id);

    if (p.id && !/^[a-z0-9-]+$/.test(p.id)) {
      problems.push(`${where}: id must be a lowercase slug (a-z, 0-9, -) - it is used in URLs.`);
    }
    if (!p.title) problems.push(`${where} is missing \`title\`.`);
    if (!p.description) problems.push(`${where} is missing \`description\`.`);
    if (p.tagline && p.tagline.length > 90) {
      warn(`${where}: tagline is ${p.tagline.length} chars; <= 90 keeps the prompt catalog small.`);
    }

    for (const [k, url] of Object.entries(p.links || {})) {
      if (url == null) continue;
      // Site-relative paths (e.g. '/phishingnet') are internal routes/files.
      if (typeof url === 'string' && url.startsWith('/')) continue;
      try {
        new URL(url);
      } catch {
        problems.push(`${where}: links.${k} is not a valid URL: ${url}`);
      }
    }
  }

  if (!profile.name) problems.push('profile.name is required.');

  /* Education entries are interpolated into chunk text unguarded, so a missing
     field doesn't throw — it commits the literal string "undefined" into the
     index and the bot repeats it to a recruiter. Fail the run instead. */
  for (const [i, e] of (profile.education || []).entries()) {
    const where = `profile.education[${i}]`;
    if (!e.school) problems.push(`${where} is missing \`school\`.`);
    if (!e.credential) problems.push(`${where} is missing \`credential\`.`);
    if (!['in-progress', 'completed'].includes(e.status)) {
      problems.push(
        `${where}.status must be 'in-progress' or 'completed' (got ${JSON.stringify(e.status)}) - ` +
          `it decides whether \`end\` prints as a fact or as "expected".`
      );
    }
  }

  /* Same hazard as education, and it is the easy mistake to make: the field
     reads like a list of things you did, so a list of strings looks right. But
     the chunk builder and the prompt block both read .role/.company/.start, and
     on a string those are undefined — which reaches the model as
     "undefined at undefined (undefined - present)" in EVERY prompt. */
  for (const [i, e] of (profile.experience || []).entries()) {
    const where = `profile.experience[${i}]`;
    if (typeof e !== 'object' || e === null || Array.isArray(e)) {
      problems.push(
        `${where} must be an object, not ${Array.isArray(e) ? 'an array' : `a ${typeof e}`} ` +
          `(got ${JSON.stringify(e)}) - use { company, role, start, end, summary, highlights }.`
      );
      continue;
    }
    if (!e.company) problems.push(`${where} is missing \`company\`.`);
    if (!e.role) problems.push(`${where} is missing \`role\`.`);
    if (!e.start) problems.push(`${where} is missing \`start\`.`);
  }

  /* Duplicate keys in an object literal overwrite silently, so two q/a pairs
     written into one set of braces yield ONE entry and the first answer is
     gone with no error anywhere. Cheap to detect, impossible to spot by eye. */
  for (const [i, f] of (profile.faq || []).entries()) {
    const where = `profile.faq[${i}]`;
    if (!f?.q) problems.push(`${where} is missing \`q\`.`);
    if (!f?.a) problems.push(`${where} is missing \`a\`.`);
  }
  const questions = (profile.faq || []).map((f) => f?.q).filter(Boolean);
  if (new Set(questions).size !== questions.length) {
    problems.push('profile.faq has duplicate questions - each Q&A needs its own { q, a } object.');
  }

  if (!profile.education?.length && !profile.experience?.length) {
    warn('profile has neither education nor experience - the bot cannot answer "what is his background?"');
  }
  if (/^TODO/i.test(profile.bio || '')) {
    warn('profile.bio is still the placeholder - it is quoted verbatim in every answer to "who is Devesh?"');
  }

  /* Skills drift. Warnings, never errors: this is a taxonomy judgement call and
     blocking a launch over it would be wrong. But the gap is invisible
     otherwise, and it runs in exactly one direction - the projects ship more
     than the profile claims, so the portfolio understates itself. */
  for (const { tech, count } of unclaimedTech) {
    warn(
      `"${tech}" ships in ${count} project(s) but is not in profile.skills - ` +
        `the bot will not name it when asked what he knows.`
    );
  }
  for (const { skill, group } of unevidencedSkills) {
    warn(`profile.skills.${group} lists "${skill}" but no project in projects.js uses it.`);
  }

  return problems;
}

/* -- Source resolution ----------------------------------------------------- */

/**
 * Most projects carry no `sources` key at all - it is derived from `links` so
 * the URLs live in exactly one place. `sources` is only for overrides/extras.
 */
function resolveSources(p) {
  if (Array.isArray(p.sources) && p.sources.length) return p.sources;
  const out = [];
  if (p.links?.repo) out.push({ type: 'github_repo', url: p.links.repo });
  if (p.links?.demo) out.push({ type: 'live_demo', url: p.links.demo, fallback: 'meta' });
  if (p.links?.docs) out.push({ type: 'docs_site', url: p.links.docs, fallback: 'meta' });
  return out;
}

/* -- Cache ----------------------------------------------------------------- */

function loadCache() {
  if (FORCE || !fs.existsSync(CACHE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    warn('cache file was unreadable, starting fresh');
    return {};
  }
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/* -- Fetchers -------------------------------------------------------------- */

function ghHeaders(extra = {}) {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'portfolio-ingest', ...extra };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function parseRepo(url) {
  const m = /github\.com\/([^/]+)\/([^/?#]+)/i.exec(url);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

async function fetchGithub(url, cached) {
  const rp = parseRepo(url);
  if (!rp) {
    warn(`not a GitHub repo URL, skipping: ${url}`);
    return null;
  }
  const base = `https://api.github.com/repos/${rp.owner}/${rp.repo}`;

  // Conditional request: GitHub does not count 304s against the rate limit,
  // so a cached re-run is effectively free.
  const cond = {};
  if (cached?.etag) cond['If-None-Match'] = cached.etag;

  const readmeRes = await fetch(`${base}/readme`, {
    headers: ghHeaders({ Accept: 'application/vnd.github.raw', ...cond }),
  });

  /* The cache stores this under `extracted.text` (see the nextCache write in
     main()); `cached.cleanedText` was never a field anyone wrote, so this
     fast-path silently never fired and every warm-cache run fell through to
     the `!readmeRes.ok` throw below and died on its own 304. */
  if (readmeRes.status === 304 && cached?.extracted?.text != null) {
    return { text: cached.extracted.text, etag: cached.etag, fromCache: true };
  }
  if (readmeRes.status === 403 || readmeRes.status === 429) {
    const remaining = readmeRes.headers.get('x-ratelimit-remaining');
    throw new Error(
      `GitHub rate limit hit (remaining=${remaining}). ` +
        (process.env.GITHUB_TOKEN
          ? 'Wait for the window to reset.'
          : 'Set GITHUB_TOKEN in .env.local to raise the limit from 60/hr to 5000/hr.')
    );
  }
  if (readmeRes.status === 404) {
    warn(`${rp.owner}/${rp.repo} has no README`);
  } else if (!readmeRes.ok) {
    throw new Error(`GitHub README ${readmeRes.status} for ${rp.owner}/${rp.repo}`);
  }

  const rawReadme = readmeRes.ok ? await readmeRes.text() : '';

  /* These two were `res.ok ? json : {}`, which turned a 403 into an empty
     header with no error. For a repo with no README that made the whole source
     empty - lyricmatcher silently contributed ZERO chunks to a run that still
     exited 0. Rate limiting is the expected failure here (60/hr unauthenticated),
     so it has to be as loud as it already is on the README fetch above. */
  const rateLimited = (r) => r.status === 403 || r.status === 429;

  const metaRes = await fetch(base, { headers: ghHeaders() });
  if (rateLimited(metaRes)) {
    throw new Error(
      `GitHub rate limit hit fetching metadata for ${rp.owner}/${rp.repo}. ` +
        (process.env.GITHUB_TOKEN
          ? 'Wait for the window to reset.'
          : 'Set GITHUB_TOKEN in .env.local to raise the limit from 60/hr to 5000/hr.')
    );
  }
  const meta = metaRes.ok ? await metaRes.json() : {};

  const langRes = await fetch(`${base}/languages`, { headers: ghHeaders() });
  if (rateLimited(langRes)) {
    throw new Error(`GitHub rate limit hit fetching languages for ${rp.owner}/${rp.repo}.`);
  }
  const langs = langRes.ok ? Object.keys(await langRes.json()) : [];

  const header = [
    meta.description ? `Repository description: ${meta.description}` : '',
    meta.topics?.length ? `Topics: ${meta.topics.join(', ')}` : '',
    langs.length ? `Languages: ${langs.join(', ')}` : '',
    meta.homepage ? `Homepage: ${meta.homepage}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const text = [header, cleanReadme(rawReadme)].filter(Boolean).join('\n\n');

  /* Backstop for any future path that yields nothing without throwing. An empty
     source contributes no chunks, and a silently smaller index is the exact
     failure mode this script exists to prevent. */
  if (!text.trim()) {
    throw new Error(
      `${rp.owner}/${rp.repo} produced no indexable text (no README and no repo metadata).`
    );
  }
  return { text, etag: readmeRes.headers.get('etag'), fromCache: false };
}

/** Regex pipeline; order matters. */
export function cleanReadme(md) {
  if (!md) return '';
  let s = md;

  s = s.replace(/<!--[\s\S]*?-->/g, ''); // HTML comments
  s = s.replace(/<img[^>]*>/gi, ''); // inline images
  s = s.replace(/<\/?(?:div|p|h[1-6]|center|a)[^>]*>/gi, ''); // layout wrappers
  s = s.replace(/<\/?(?:details|summary)[^>]*>/gi, ''); // keep the text, drop the tags

  // Badge lines, and any line that is overwhelmingly link markup.
  s = s
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^\[!\[.*\]\(.*\)\]\(.*\)$/.test(t)) return false;
      const linkChars = (t.match(/\[!?[^\]]*\]\([^)]*\)/g) || []).join('').length;
      return !(linkChars / t.length > 0.8);
    })
    .join('\n');

  // Long code fences are BM25 poison: identifiers flood the term space. Short
  // ones (install commands, a two-line snippet) carry real signal, so keep them.
  s = s.replace(/```[\s\S]*?```/g, (block) =>
    block.length <= 300 ? block : '\n[code block omitted]\n'
  );

  // Sections that say nothing about the project itself.
  const DROP =
    /^#{1,6}\s*(license|licence|contributing|acknowledge?ments?|code of conduct|table of contents|contents)\b/i;
  const kept = [];
  let dropDepth = 0;
  for (const line of s.split('\n')) {
    const h = /^(#{1,6})\s/.exec(line);
    if (h) {
      if (DROP.test(line)) {
        dropDepth = h[1].length;
        continue;
      }
      if (dropDepth && h[1].length <= dropDepth) dropDepth = 0;
    }
    if (!dropDepth) kept.push(line);
  }
  s = kept.join('\n');

  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Detect a client-rendered shell.
 * @returns {{thin:boolean, reason:string|null, text:string, meta:string}}
 */
export function extractSite(html) {
  const $ = cheerio.load(html);

  const metaBits = [
    $('title').first().text().trim(),
    $('meta[name="description"]').attr('content') || '',
    $('meta[property="og:title"]').attr('content') || '',
    $('meta[property="og:description"]').attr('content') || '',
  ].filter(Boolean);
  const meta = [...new Set(metaBits)].join('\n').trim();

  const noscript = $('noscript').text().trim();
  const moduleScripts = $('script[src]').length;
  const bodyChildren = $('body')
    .children()
    .filter((_, el) => el.type === 'tag' && !['script', 'style', 'noscript'].includes(el.name));
  const mountId = bodyChildren.length === 1 ? bodyChildren.first().attr('id') : null;
  const mountIsEmpty = bodyChildren.length === 1 && bodyChildren.first().children().length === 0;

  // Text extraction mutates the tree, so everything structural is read first.
  const $body = $('body');
  $body.find('script, style, noscript, template, svg').remove();
  const text = $body.text().replace(/\s+/g, ' ').trim();

  if (/enable JavaScript to run this app/i.test(noscript) && text.length < 300) {
    return { thin: true, reason: 'noscript "enable JavaScript" message with no body text', text, meta };
  }
  if (mountIsEmpty && ['root', 'app', '__next'].includes(mountId)) {
    return { thin: true, reason: `single empty mount node #${mountId}`, text, meta };
  }
  if (text.length < 300 && moduleScripts >= 2) {
    return {
      thin: true,
      reason: `only ${text.length} chars of text alongside ${moduleScripts} external scripts`,
      text,
      meta,
    };
  }
  if (text.length < 300) {
    return { thin: true, reason: `only ${text.length} chars of extractable text`, text, meta };
  }

  return { thin: false, reason: null, text, meta };
}

/**
 * Fetch and extract a page, using the cache when the content is unchanged.
 *
 * The cache deliberately stores the RAW extraction (text, meta, thin, reason)
 * and NOT the post-fallback result. Caching the post-fallback text would mean a
 * source that was once thin stays permanently cached as whatever the fallback
 * produced — so flipping `fallback` from 'meta' to 'error' would silently do
 * nothing, and the fatal client-rendered check would never run again. Policy is
 * applied fresh on every run, against cached extraction.
 */
async function fetchSiteRaw(url, cached) {
  const headers = { 'User-Agent': 'portfolio-ingest' };
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

  const usable = cached && cached.extracted != null;

  const res = await fetch(url, { headers, redirect: 'follow' });

  if (res.status === 304 && usable) {
    return { ...cached.extracted, etag: cached.etag, lastModified: cached.lastModified, sha256: cached.sha256, fromCache: true };
  }
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);

  const html = await res.text();
  const hash = sha256(html);
  const etag = res.headers.get('etag');
  const lastModified = res.headers.get('last-modified');

  // Many hosts send neither ETag nor Last-Modified; the content hash covers them.
  if (!FORCE && usable && cached.sha256 === hash) {
    return { ...cached.extracted, etag, lastModified, sha256: hash, fromCache: true };
  }

  return { ...extractSite(html), etag, lastModified, sha256: hash, fromCache: false };
}

/**
 * Apply the per-source fallback policy to a raw extraction.
 * `rawText` always carries the untouched extraction so the caller can cache it;
 * `text` is the effective text to index.
 */
function applyFallback(raw, fallback) {
  const { thin, reason, text, meta } = raw;
  const base = { ...raw, rawText: text };

  if (!thin) return base;

  if (fallback === 'meta' && meta) {
    log(`    -> client-rendered (${reason}); indexing page metadata only`);
    return { ...base, text: meta };
  }
  if (fallback === 'manual') {
    log(`    -> client-rendered (${reason}); skipping, using your authored source instead`);
    return { ...base, text: '' };
  }
  const why =
    fallback === 'meta'
      ? `${reason}, and no <title>/<meta description> to fall back to`
      : reason;
  return { ...base, fatal: true, reason: why };
}

/* -- Chunking -------------------------------------------------------------- */

/** Split markdown on h1-h3, ignoring `#` inside fenced code blocks. */
function splitByHeading(text, rootTitle) {
  const sections = [];
  let heading = null;
  let buf = [];
  let inFence = false;

  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) sections.push({ heading, body });
    buf = [];
  };

  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const h = !inFence && /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      heading = h[2].trim();
      continue;
    }
    buf.push(line);
  }
  flush();

  return sections.map((s) => ({
    heading: s.heading ? `${rootTitle} > ${s.heading}` : rootTitle,
    body: s.body,
  }));
}

/** Size-bound a section, splitting on paragraph boundaries with overlap. */
function splitBySize(body) {
  if (body.length <= CHUNK_MAX) return [body];
  const paras = body.split(/\n\s*\n/);
  const out = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > CHUNK_TARGET) {
      out.push(cur.trim());
      cur = cur.slice(Math.max(0, cur.length - CHUNK_OVERLAP)) + '\n\n' + p;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function chunkText(text, { rootTitle, projectId, title, sourceUrl, sourceType }) {
  const chunks = [];
  const sections = splitByHeading(text, rootTitle);

  // Merge runt sections forward - a 40-char chunk is pure noise in the df table.
  const merged = [];
  for (const s of sections) {
    const prev = merged[merged.length - 1];
    if (prev && prev.body.length < CHUNK_MIN) {
      prev.body = `${prev.body}\n\n${s.body}`;
    } else {
      merged.push({ ...s });
    }
  }

  for (const s of merged) {
    for (const piece of splitBySize(s.body)) {
      if (piece.trim().length < 40) continue;
      chunks.push({
        id: `${projectId}:${sourceType}:${chunks.length}`,
        projectId,
        title,
        sourceUrl,
        sourceType,
        heading: s.heading,
        // Prepending the heading path is deliberate: it is a strong lexical
        // signal AND it is what the prompt shows as the citation label.
        text: `${s.heading}\n\n${piece.trim()}`,
      });
    }
  }
  return chunks;
}

/* -- Authored chunks ------------------------------------------------------- */

function authoredChunks() {
  const out = [];

  for (const p of projects) {
    const parts = [
      `${p.title} - ${p.tagline || ''}`,
      p.description,
      p.tech?.length ? `Built with: ${p.tech.join(', ')}.` : '',
      p.aliases?.length ? `Also referred to as: ${p.aliases.join(', ')}.` : '',
      p.role ? `Role: ${p.role}.` : '',
      p.year ? `Year: ${p.year}. Status: ${p.status}.` : '',
      ...(p.highlights || []),
    ].filter(Boolean);

    out.push({
      id: `${p.id}:authored:0`,
      projectId: p.id,
      title: p.title,
      sourceUrl: p.links?.repo || p.links?.demo || null,
      sourceType: 'authored',
      heading: p.title,
      text: parts.join('\n'),
    });

    let n = 1;
    for (const s of resolveSources(p).filter((s) => s.type === 'authored' && s.text)) {
      out.push({
        id: `${p.id}:authored:${n++}`,
        projectId: p.id,
        title: p.title,
        sourceUrl: p.links?.repo || null,
        sourceType: 'authored',
        heading: `${p.title} > notes`,
        text: s.text,
      });
    }
  }

  // Profile: bio/skills/availability as one chunk, then one per experience,
  // education and FAQ entry.
  const bio = [
    `${profile.name}${profile.headline ? ` - ${profile.headline}` : ''}`,
    profile.bio,
    profile.location ? `Located in ${profile.location}.` : '',
    profile.availability || '',
    Object.entries(profile.skills || {})
      .filter(([, v]) => v?.length)
      .map(([k, v]) => `${k}: ${v.join(', ')}`)
      .join('. '),
    profile.email ? `Contact: ${profile.email}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  out.push({
    id: 'profile:authored:bio',
    projectId: null,
    title: profile.name,
    sourceUrl: profile.links?.github || null,
    sourceType: 'authored',
    heading: 'About',
    text: bio,
  });

  for (const [i, e] of (profile.experience || []).entries()) {
    out.push({
      id: `profile:authored:exp${i}`,
      projectId: null,
      title: `${e.role} at ${e.company}`,
      sourceUrl: null,
      sourceType: 'authored',
      heading: 'Experience',
      text: [
        `${e.role} at ${e.company} (${e.start} - ${e.end || 'present'})`,
        e.summary,
        ...(e.highlights || []),
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  /* Education is indexed as well as being injected into the trusted profile
     block in api/_lib/prompt.js. Both, deliberately: every profile chunk shares
     the '__profile__' key under PER_PROJECT_CAP, so at most two of them ever
     reach a prompt and a growing FAQ can crowd education out of retrieval
     entirely. The prompt block guarantees the answer exists; this chunk carries
     the detail (coursework, highlights) when it does win a slot. */
  for (const [i, e] of (profile.education || []).entries()) {
    out.push({
      id: `profile:authored:edu${i}`,
      projectId: null,
      title: `${e.credential}, ${e.school}`,
      sourceUrl: e.url || null,
      sourceType: 'authored',
      heading: 'Education',
      text: [
        /* The wording here is retrieval tuning, not prose. tokenize() in
           _lib/bm25.js does no stemming, and "where"/"does"/"he" are all
           stopwords — so "where does he study?" reduces to the single term
           `study`. If the words a visitor actually types (student, studying,
           degree, university, graduate) do not appear literally in this text,
           BM25 scores it zero. The redundancy IS the retrieval, exactly as
           `aliases` works for projects. */
        `${profile.name} is a student at ${e.school}.`,
        `He is studying ${e.credential} at ${e.school} (${eduRange(e)}).`,
        /* A label line rather than prose. It carries the terms "school",
           "degree" and "university" for the tokenizer without ASSERTING any of
           them — the earlier wording said "studying for a ${credential} degree"
           and "the university is in X", which turned GCSEs into a degree and a
           secondary school into a university. Neutral phrasing keeps the
           retrieval vocabulary and drops the false claim. */
        `School / college / university: ${e.school}. Qualification or degree: ${e.credential}.`,
        e.status === 'completed'
          ? `He completed this${e.end ? ` in ${e.end}` : ''}.`
          : `He has not graduated yet; expected graduation ${e.end || 'not set'}.`,
        e.location ? `The school is located in ${e.location}.` : '',
        e.gpa ? `GPA: ${e.gpa}.` : '',
        e.coursework?.length
          ? `Relevant coursework, courses and classes he has studied: ${e.coursework.join(', ')}.`
          : '',
        ...(e.highlights || []),
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  for (const [i, f] of (profile.faq || []).entries()) {
    out.push({
      id: `profile:authored:faq${i}`,
      projectId: null,
      title: profile.name,
      sourceUrl: null,
      sourceType: 'authored',
      heading: 'FAQ',
      text: `Q: ${f.q}\nA: ${f.a}`,
    });
  }

  return out;
}

/* -- Main ------------------------------------------------------------------ */

async function main() {
  loadDotEnv();

  log(`\nIngest${DRY_RUN ? ' (dry run)' : ''}${FORCE ? ' (forced)' : ''}\n`);

  const problems = validate();
  if (problems.length) {
    console.error('Schema validation failed:\n');
    for (const p of problems) console.error('  x', p);
    console.error('');
    process.exit(1);
  }
  log(`ok schema valid - ${projects.length} project(s)`);

  const cache = loadCache();
  const nextCache = {};
  const chunks = [...authoredChunks()];
  const thin = [];
  let fetched = 0;
  let cacheHits = 0;

  for (const p of projects) {
    const sources = resolveSources(p).filter((s) => s.type !== 'authored');
    if (!sources.length) {
      log(`  . ${p.id}: no repo or demo link yet - authored text only`);
      continue;
    }

    for (const src of sources) {
      log(`  . ${p.id}: ${src.type} ${src.url}`);
      const cached = cache[src.url];
      let result;
      try {
        if (src.type === 'github_repo') {
          result = await fetchGithub(src.url, cached);
        } else {
          const raw = await fetchSiteRaw(src.url, cached);
          result = applyFallback(raw, src.fallback || 'meta');
        }
      } catch (err) {
        /* Rethrow rather than process.exit() here: this runs with fetch handles
           still open, and an immediate exit trips a libuv assertion on Windows
           that replaces exit code 1 with 3221226505 - unusable in CI. The
           top-level catch sets exitCode and lets the loop unwind cleanly. */
        throw new Error(`${p.id}: ${err.message}`);
      }

      if (!result) continue;

      result.fromCache ? cacheHits++ : fetched++;
      nextCache[src.url] = {
        etag: result.etag || null,
        lastModified: result.lastModified || null,
        sha256: result.sha256 || cached?.sha256 || null,
        fetchedAt: new Date().toISOString(),
        // Raw extraction, pre-fallback — see fetchSiteRaw's comment.
        extracted:
          src.type === 'github_repo'
            ? { thin: false, reason: null, text: result.text, meta: '' }
            : { thin: result.thin, reason: result.reason, text: result.rawText ?? result.text, meta: result.meta || '' },
      };

      if (result.fatal) {
        thin.push({ project: p.id, url: src.url, reason: result.reason });
        continue;
      }

      if (!result.text.trim()) continue;
      chunks.push(
        ...chunkText(result.text, {
          rootTitle: p.title,
          projectId: p.id,
          title: p.title,
          sourceUrl: src.url,
          sourceType: src.type,
        })
      );
    }
  }

  if (thin.length) {
    console.error(`\nx ${thin.length} source(s) returned no usable text.\n`);
    console.error('  These look client-rendered. Indexing them would silently produce an');
    console.error('  empty index, so this run is being failed instead of warning.\n');
    for (const t of thin) {
      console.error(`  ${t.project} - ${t.url}`);
      console.error(`     reason: ${t.reason}`);
      console.error('     fix: add a `sources` entry for this project in src/data/projects.js:');
      console.error(`       { type: 'live_demo', url: '${t.url}', fallback: 'meta' }    // index <title>/<meta> only`);
      console.error(`       { type: 'live_demo', url: '${t.url}', fallback: 'manual' }  // plus { type:'authored', text:'...' }`);
      console.error('');
    }
    process.exit(1);
  }

  log(`\nok ${chunks.length} chunks (${fetched} source(s) fetched, ${cacheHits} from cache)`);
  const byType = chunks.reduce((m, c) => ((m[c.sourceType] = (m[c.sourceType] || 0) + 1), m), {});
  log(`   ${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(', ')}`);

  /* Embeddings - reuse cached vectors keyed by chunk-text hash so a re-run
     only spends quota on what actually changed. */
  let embedded = 0;
  const vecCache = cache.__vectors || {};
  const nextVec = {};

  if (!DRY_RUN && hasEmbeddingKey()) {
    const todo = [];
    for (const c of chunks) {
      const key = sha256(c.text);
      c._vkey = key;
      if (!FORCE && vecCache[key]) {
        c.vector = vecCache[key];
        nextVec[key] = vecCache[key];
      } else {
        todo.push(c);
      }
    }
    log(`   embedding ${todo.length} new/changed chunk(s), ${chunks.length - todo.length} reused`);

    for (let i = 0; i < todo.length; i += 50) {
      const batch = todo.slice(i, i + 50);
      let vectors = null;
      for (let attempt = 0; attempt < 3 && !vectors; attempt++) {
        try {
          vectors = await embedBatch(batch.map((c) => c.text), 'RETRIEVAL_DOCUMENT');
        } catch (err) {
          if (attempt === 2) {
            warn(`embedding failed (${err.message}); writing a BM25-only index`);
            break;
          }
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!vectors) break;
      batch.forEach((c, j) => {
        c.vector = vectors[j];
        nextVec[c._vkey] = vectors[j];
        embedded++;
      });
    }
  } else if (!hasEmbeddingKey()) {
    log('   . EMBED_API_KEY not set - writing a BM25-only index (retrieval still works)');
  }

  for (const c of chunks) delete c._vkey;

  if (DRY_RUN) {
    log(`\nDry run: index NOT written. ${warnings} warning(s).\n`);
    return;
  }

  const withVectors = chunks.filter((c) => c.vector).length;
  const payload = {
    version: 1,
    builtAt: new Date().toISOString(),
    embedModel: withVectors ? EMBED_MODEL : null,
    embedDim: withVectors ? EMBED_DIM : null,
    chunks: chunks.map((c) => ({
      ...c,
      // 5 decimals is well inside the noise floor for normalised vectors and
      // roughly halves the committed file.
      vector: c.vector ? c.vector.map((v) => Number(v.toFixed(5))) : null,
    })),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    '// GENERATED BY `yarn ingest` - DO NOT EDIT BY HAND.\n' +
      `// Built ${payload.builtAt} from src/data/projects.js + src/data/profile.js.\n` +
      `export default ${JSON.stringify(payload)};\n`
  );

  nextCache.__vectors = nextVec;
  fs.writeFileSync(CACHE_PATH, JSON.stringify(nextCache, null, 2));

  const kb = (fs.statSync(OUT_PATH).size / 1024).toFixed(0);
  log(`\nok wrote api/_data/index.js - ${chunks.length} chunks, ${withVectors} with vectors, ${kb} KB`);
  log(`   ${embedded} embedded this run. ${warnings} warning(s).\n`);
}

// Only run when invoked directly, so the cleaning and SPA-detection helpers
// above can be imported by tests without kicking off a full ingest.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`
  x ${err.message}
`);
    // exitCode, not exit(): lets pending handles close before the process ends.
    process.exitCode = 1;
  });
}
