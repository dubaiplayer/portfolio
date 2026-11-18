/**
 * Site-wide profile data.
 *
 * ⚠ This module is imported by THREE different runtimes:
 *   1. React (Vite bundle)          — the homepage / contact / experience pages
 *   2. Plain Node (scripts/ingest.mjs) — the RAG ingest script
 *   3. The Vercel serverless function  — api/chat.js
 *
 * Therefore: PLAIN DATA ONLY. No JSX, no CSS imports, no Vite asset imports
 * (`import x from './x.png'`). Image paths are strings under `public/`.
 * Breaking this rule breaks ingest AND production at the same time.
 * (Plain helper functions are fine — projects.js exports `sortedProjects()`.)
 *
 * ── How these fields reach the chatbot ───────────────────────────────────────
 * Two different paths, and the difference matters when you decide where to put
 * a fact:
 *
 *   TRUSTED BLOCK — `buildProfileBlock()` in api/_lib/prompt.js injects name,
 *     headline, location, bio, skills, education, experience, availability and
 *     links into EVERY prompt. Always present, never competes for space.
 *
 *   RETRIEVAL INDEX — `scripts/ingest.mjs` builds one chunk from bio/skills,
 *     then one chunk EACH per experience, education and faq entry. These only
 *     reach the model when they win a top-k slot, so they carry the detail
 *     (coursework, highlights, long answers) rather than the headline fact.
 *
 * Anything you change here is invisible to the bot until you re-run
 * `yarn ingest` AND commit api/_data/index.js. That artifact is a snapshot.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Renders an education date range for the page, the chunk and the prompt from
 * ONE place, so the three can't disagree.
 *
 * A student's `end` is a date in the FUTURE. The `experience[]` idiom of
 * "null means present" cannot express "expected 2028", and printing a bare
 * `2028-05` states a projection as fact — which is precisely what Rule 2 of the
 * system prompt ("never guess dates") forbids. Hence the explicit `status`.
 */
export function eduRange(e) {
  if (!e?.end) return `${e?.start || ''} - present`;
  return `${e.start || ''} - ${e.status === 'completed' ? e.end : `expected ${e.end}`}`;
}

export const profile = {
  name: 'Devesh Gupta',

  // TODO: one line, shown under your name and in every prompt.
  // e.g. "CS student building ML tools and web apps"
  headline: 'Student developer and researcher working on phishing defence',

  /* TODO: 3-6 sentences in your own voice. Who you are, what you like building,
     what you're looking for.
     ⚠ HIGHEST-IMPACT FIELD IN THIS FILE. It goes into every single prompt
     verbatim, and the bot quotes it almost word-for-word when someone asks
     "who is Devesh?". Right now it answers that question by reciting this
     placeholder. Write it the way you'd want to be introduced. */
  bio: `I am a student developer and researcher who builds web applications and machine learning tools. My main project is PhishingNet, an explainable phishing detector, and I am now running a study on whether explaining why an email is suspicious helps people more than a simple warning. I am also developing an interest in criminology and want to do more projects in that field after PhishingNet.`,

  location: 'Dubai, UAE', // TODO: e.g. "Dubai, UAE" — renders as "Located in X." (no period needed)
  email: 'guptadevesh@hotmail.com',

  /* TODO: ⚠ emitted RAW into the bio chunk with no label and no period added.
     Write a COMPLETE SENTENCE: "Open to summer 2026 internships." */
  availability: 'Open to collaborating on projects and to mentorship in security and criminology research.',

  links: {
    github: 'https://github.com/dubaiplayer',
    linkedin: null, // TODO — appears in the trusted block and on /contact once set
    youtube: null, // TODO — the homepage icon stays hidden until this is set
  },

  /* ⚠ The object KEYS are printed verbatim into the bio chunk and the prompt
     block ("languages: a, b. frameworks: c, d"), so keep them presentable.
     Groups with an empty array are dropped automatically — add or remove
     groups freely, /expertise iterates whatever is here.

     TODO: this currently claims JavaScript/React/Vite only, while projects.js
     ships Python, scikit-learn, FastAPI, TypeScript, Electron, Express and
     SQLite. A recruiter reading it today would conclude you can't write
     Python. Fix this before launch. */
  /* Every entry below is demonstrable from a project in projects.js — check
     `yarn ingest:check`, which warns in BOTH directions: tech you've shipped
     but don't claim, and skills you claim that no project backs up. Remove
     anything here you wouldn't want to be asked about in an interview. */
  skills: {
    languages: ['Python', 'JavaScript', 'TypeScript'],
    frameworks: ['React', 'FastAPI', 'Express', 'Vite', 'Electron'],
    libraries: ['scikit-learn', 'sentence-transformers'],
    tools: ['Git', 'SQLite', 'Vercel', 'Node.js', 'Chrome Extension'],
  },

  /**
   * Jobs and internships. Empty is fine and handled everywhere — the /experience
   * page omits the section entirely and the prompt says "none yet, he is a
   * student" rather than leaving the model to guess.
   *
   * Each entry becomes its own indexed chunk. NO VALIDATION: a missing field
   * embeds the literal string "undefined" into the index.
   *   { company, role, start, end, summary, highlights }
   *   required: company, role, start   |   end: null ⇒ "present"
   */
  experience: [
    {
      company: 'ALPTech',
      role: 'Work Experience Placement',
      start: '2026-02',
      end: '2026-02', // two-week placement
      summary: 'A two-week placement where I learned how options trading works and built a Brownian motion model to price options.',
      highlights: [
        'Built a Brownian motion simulation to predict option prices, and adapted it for options markets in different regions.',
        'Extended the model with extra parameters, including variance and volatility of volatility.',
      ],
    },
  ],

  /**
   * Each entry becomes its own indexed chunk AND a line in the trusted block.
   *
   *   school      REQUIRED
   *   credential  REQUIRED — spell the degree out: "BSc (Hons) Computer Science"
   *   start       'YYYY-MM'
   *   end         'YYYY-MM' — may be in the future; `status` disambiguates
   *   status      REQUIRED — 'in-progress' | 'completed'
   *   location    optional
   *   gpa         optional string, e.g. '3.9/4.0' — omit unless it helps you
   *   coursework  optional string[] — real course titles. HIGH VALUE: the
   *               retriever does not stem, so listing "Data Structures",
   *               "Machine Learning" etc. is what lets the bot answer
   *               "has he studied ML?" at all.
   *   highlights  optional string[] — awards, societies, TA work, capstone
   *   url         optional — becomes the chunk's citation link
   */
  education: [
    
    {
      school: 'JESS, Dubai',
      credential: 'GCSEs, then A-Levels',
      start: '2022-09',
      end: '2029-06',
      status: 'in-progress',
      location: 'Dubai, UAE',
      gpa: null,
      /* TODO — the single highest-value empty field left. The retriever does no
         stemming, so these exact subject names are what let the bot answer
         "has he studied computer science / maths / physics?" at all. List the
         subjects you're actually taking, e.g. 'Computer Science', 'Mathematics'. */
      coursework: [],
      // Short programmes belong here, not in experience[] — they're real
      // achievements but they aren't employment, and labelling them
      // "Work experience" to a recruiter would overstate them.
      highlights: [
        'Selected for The Innovation Story Fellowship, 2026.',
        'Completed the AWS Bootcamp, 2025.',
      ],
      url: null,
    },
  ],

  /**
   * Hand-authored answers to the questions recruiters actually ask.
   *
   * ⚠ HIGHEST-LEVERAGE FIELD IN THIS FILE after `bio`. Each entry is its own
   * `authored` chunk, and authored chunks are boosted 1.6x over anything
   * scraped from a README. With no work history, this is what does the talking.
   *
   * TODO: aim for 6-8 entries. Keep each answer 1-3 sentences.
   */
  faq: [
    // ⚠ Each Q&A is its OWN object. Putting two q/a pairs inside one set of
    // braces is silent data loss: duplicate keys in a JS object literal
    // overwrite, so the first pair vanishes with no error.
    {
      q: 'How do I get in touch?',
      a: `Email is best: guptadevesh@hotmail.com. Code is at github.com/dubaiplayer.`,
    },
    {
      q: 'What is your main project?',
      a: `PhishingNet is a lightweight machine learning model that performs full semantic analysis of fraudulent emails, scoring the top manipulation tactics and other indicators. It is my main project and I am still improving it.`,
    },
    {
      q: 'Why did you build PhishingNet?',
      a: `A family member was caught out by a phishing email. Most tools just block or flag messages without explaining why, so people never learn to spot the warning signs themselves. I wanted a tool that shows its reasons.`,
    },
    {
      q: 'What research are you doing with PhishingNet?',
      a: `I am running a study on whether explaining why an email is suspicious helps people more than a simple "phishing / not phishing" label, and whether they get better at spotting phishing on their own afterwards.`,
    },
    {
      q: 'What are you looking for?',
      a: `I am open to collaborating on projects and to mentorship in security and criminology research.`,
    },
    {
      q: 'What is your strongest programming language?',
      a: `Python. PhishingNet and Resonate are both built on Python, using scikit-learn, FastAPI and sentence-transformers.`,
    },
    {
      q: 'What are you learning right now?',
      a: `R and data visualisation, so I can analyse and present the results of my phishing study.`,
    },
    {
      q: 'Do you have work experience?',
      a: `Yes. In February 2026 I did a two-week placement at ALPTech, where I learned about options trading and built a Brownian motion model to price options, including volatility of volatility.`,
    },
  ],
};

export default profile;
