#!/usr/bin/env node
/**
 * Offline retrieval evaluation.  `yarn eval`
 *
 * No LLM call, no cost, no network unless EMBED_API_KEY is set. This is where
 * retrieval quality is actually won or lost — tuning boosts by asking the
 * chatbot questions by hand burns the Groq free tier and gives you one noisy
 * sample per minute.
 *
 * Add a case here whenever the bot gets something wrong. `expect` is a list of
 * projectIds (or 'profile') that must appear in the retrieved chunks;
 * `expectEmpty` asserts the relevance floor rejects the query outright.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrieve } from '../api/_lib/retrieve.js';
import { profile } from '../src/data/profile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const CASES = [
  // -- named outright ------------------------------------------------------
  { q: 'Tell me about PhishingNet', expect: ['phishingnet'], why: 'names the project' },
  { q: 'what is AgentDock?', expect: ['agentdock'], why: 'names the project' },

  // -- aliases: the repo name differs from the product name ----------------
  { q: 'what did you use TIS for?', expect: ['phishingnet'], why: 'repo name TIS -> product PhishingNet' },
  { q: 'tell me about NANDA', expect: ['agentdock'], why: 'repo name NANDA -> product AgentDock' },

  // -- technology filters --------------------------------------------------
  { q: 'anything built with FastAPI?', expect: ['phishingnet', 'lyricmatcher'], why: 'tech shared by two projects' },
  { q: 'what has he done with machine learning?', expect: ['phishingnet'], why: 'ml synonym expansion' },

  // -- paraphrase: no shared vocabulary with the source text ---------------
  // These are the cases dense retrieval is supposed to fix. On a BM25-only
  // index some will soft-fail; once EMBED_API_KEY is set they should pass.
  { q: 'how does it decide whether an email is a scam?', expect: ['phishingnet'],
    why: 'scam -> phishing synonym', soft: true },
  { q: 'how do agents hand work to each other?', expect: ['agentdock'],
    why: 'pure paraphrase of task delegation', soft: true },
  { q: 'how does it pick which songs to suggest?', expect: ['lyricmatcher'],
    why: 'paraphrase of the recommender scoring', soft: true },
  { q: 'is the model actually accurate?', expect: ['phishingnet'],
    why: 'accuracy -> f1/precision/recall', soft: true },

  // -- honesty: the limitations should be retrievable, not buried ----------
  { q: 'what are the weaknesses of the phishing detector?', expect: ['phishingnet'],
    why: 'the documented leakage caveat is a selling point, not something to hide' },

  // -- profile -------------------------------------------------------------
  { q: 'how do I get in touch?', expect: ['profile'], why: 'FAQ chunk' },
  { q: 'who is Devesh?', expect: ['profile'], why: 'bio chunk' },

  // -- education -----------------------------------------------------------
  // `expectChunk` matters here: idsOf() collapses every profile chunk to the
  // string 'profile', so `expect: ['profile']` alone passes when the bio chunk
  // comes back and education never does — which is exactly the PER_PROJECT_CAP
  // starvation the heading sub-bucket in retrieve.js fixes. Assert the id.
  // `needs` skips the case until the data it tests exists. A case that CANNOT
  // pass yet must not report FAIL — a permanently red eval is one nobody reads.
  { q: 'where does he study?', expect: ['profile'], expectChunk: 'profile:authored:edu0',
    needs: 'education', why: 'tokenizer does not stem: "study" must appear literally in the edu chunk' },
  { q: 'what is he studying?', expect: ['profile'], expectChunk: 'profile:authored:edu0',
    needs: 'education', why: 'surface form "studying" via synonym expansion' },
  { q: 'when does he graduate?', expect: ['profile'], expectChunk: 'profile:authored:edu0',
    needs: 'education', why: 'graduation date lives only in the education chunk' },
  { q: 'what courses has he taken?', expect: ['profile'], expectChunk: 'profile:authored:edu0',
    needs: 'education', why: 'coursework terms', soft: true },

  // The answer here comes from the trusted profile block, not retrieval, and
  // project chunks are the honest evidence for a student. All this asserts is
  // that the relevance floor doesn't reject it outright, leaving the bot to say
  // "I don't know" about its owner's own background.
  { q: 'does he have work experience?', expectNonEmpty: true,
    why: 'must not come back empty - the trusted block supplies the actual answer' },

  // -- out of scope --------------------------------------------------------
  { q: 'what is the capital of France?', expectEmpty: true, why: 'relevance floor must reject' },
  { q: 'write me a python script to sort a list', expectEmpty: true,
    why: 'off-topic; the prompt rules also refuse this, so retrieval is only the first line', soft: true },
];

function idsOf(chunks) {
  return [...new Set(chunks.map((c) => c.projectId || 'profile'))];
}

/** Data a case depends on. A case whose data isn't filled in yet is skipped. */
const AVAILABLE = {
  education: () => (profile.education || []).length > 0,
  experience: () => (profile.experience || []).length > 0,
};

const run = async () => {
  let pass = 0, fail = 0, softFail = 0, skipped = 0;
  console.log(`\nRetrieval eval — ${CASES.length} cases\n`);

  for (const c of CASES) {
    if (c.needs && !AVAILABLE[c.needs]?.()) {
      skipped++;
      console.log(`SKIP  ${c.q}`);
      console.log(`      profile.${c.needs} is empty — fill it in, re-run \`yarn ingest\`, then this case runs`);
      continue;
    }

    const { chunks, usedEmbeddings } = await retrieve(c.q, {});
    const got = idsOf(chunks);

    let ok;
    if (c.expectEmpty) ok = chunks.length === 0;
    else if (c.expectNonEmpty) ok = chunks.length > 0;
    else {
      ok =
        c.expect.every((e) => got.includes(e)) &&
        (!c.expectChunk || chunks.some((ch) => ch.id === c.expectChunk));
    }

    if (ok) pass++;
    else if (c.soft) softFail++;
    else fail++;

    const tag = ok ? 'PASS' : c.soft ? 'SOFT' : 'FAIL';
    console.log(`${tag}  ${c.q}`);
    const want = c.expectEmpty
      ? '(nothing)'
      : c.expectNonEmpty
        ? '(anything)'
        : c.expect.join(', ');
    console.log(
      `      expected ${want}${c.expectChunk ? ` [${c.expectChunk}]` : ''}` +
        ` | got ${got.join(', ') || '(nothing)'}` +
        `${usedEmbeddings ? ' | hybrid' : ' | bm25-only'}`
    );
    if (!ok) console.log(`      ${c.why}`);
    if (!ok && chunks.length) {
      for (const ch of chunks.slice(0, 3)) console.log(`        - ${ch.id} (${ch.sourceType})`);
    }
  }

  console.log(
    `\n${pass} passed, ${fail} failed, ${softFail} soft-failed` +
      (skipped ? `, ${skipped} skipped` : '')
  );
  if (softFail) {
    console.log(
      'Soft failures are the paraphrase/off-topic cases that dense retrieval is\n' +
        'supposed to fix. Expect them to fail on a BM25-only index; if they still\n' +
        'fail once EMBED_API_KEY is set, that is a real regression.'
    );
  }
  process.exit(fail ? 1 : 0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
