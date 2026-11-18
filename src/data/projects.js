/**
 * The single source of truth for projects.
 *
 * ⚠ This module is imported by THREE different runtimes:
 *   1. React (Vite bundle)             — src/Work/Work.jsx renders it
 *   2. Plain Node (scripts/ingest.mjs) — scrapes `sources` and builds the RAG index
 *   3. The Vercel serverless function  — api/chat.js builds the project catalog from it
 *
 * Therefore: PLAIN DATA ONLY. No JSX, no CSS imports, no Vite asset imports
 * (`import cover from './cover.png'`). Cover images are strings under `public/`.
 * Breaking this rule breaks ingest AND production at the same time.
 * `yarn ingest:check` asserts this.
 *
 * ── Field reference ──────────────────────────────────────────────────────────
 *  id         Stable slug. Used as the citation key, the DOM id on the Work page
 *             (`#project-<id>`), and the chat's URL hash. NEVER change it once shipped.
 *  tagline    <= 90 chars. Goes into the project catalog injected into every prompt.
 *  description Hand-written and authoritative. Becomes the `authored` chunk, which is
 *             boosted above anything scraped — so this is what the bot leads with.
 *  aliases    NOT decoration. Bridges what people type ("plane tracker") to this
 *             project ("flight-tracker") for keyword retrieval, and drives the
 *             named-project pin in api/_lib/retrieve.js. Aim for 3-6.
 *  links      The UI's source of truth for buttons on the card.
 *  sources    OPTIONAL. Omit it and ingest derives it from `links`:
 *               repo -> { type: 'github_repo' }
 *               demo -> { type: 'live_demo', fallback: 'meta' }
 *             Only add `sources` to override that or to add extra material:
 *               { type: 'github_repo', url }
 *               { type: 'live_demo', url, fallback: 'meta' | 'manual' | 'error' }
 *               { type: 'authored', text: 'Notes not shown in the UI.' }
 *             `fallback` controls what happens when a demo URL turns out to be a
 *             client-rendered shell with no text to scrape:
 *               'meta'   -> index <title>/<meta description>/OG tags only  (default)
 *               'manual' -> pair with an `authored` source you write by hand
 *               'error'  -> keep it fatal (for a site you believe is server-rendered)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const projects = [
  // ───────────────────────────────────────────────────────────────────────────
  // Drafted from each repo's README (and, for lyricmatcher, from its source —
  // it has no README). Everything below is traceable to real material; check it
  // for accuracy and rewrite in your own voice where it sounds like someone
  // else. `role` is a guess in every case — correct it where it's wrong.
  // ───────────────────────────────────────────────────────────────────────────

  {
    id: 'phishingnet',
    title: 'PhishingNet',
    tagline: 'Explainable phishing-email analysis — every score traces back to the words that caused it.',
    description: `An email analyzer that explains itself. Paste in an email and it returns a
phishing/suspicious/legitimate verdict plus 19 separately scored signals — 12 manipulation
tactics such as urgency, fear, reward bait, authority impersonation and credential harvesting,
and 7 checks on the raw message such as sender authentication, link deception and attachment
risk — each with a plain-English explanation and the exact text that triggered it. The signals
are fused with a TF-IDF/logistic-regression classifier through a transparent noisy-OR, and a
header-aware trust step lowers the risk for authenticated mail from established senders, so
genuine security alerts and receipts aren't flagged. It ships as a
published Chrome extension that scores emails inline in Gmail and Outlook, plus a CLI, a
local FastAPI server and an Electron/React desktop app — all over one Python engine, and
all running locally, so no email ever leaves the machine.`,
    role: 'Solo',
    status: 'live',
    featured: true,
    year: 2026,
    tech: ['Python', 'scikit-learn', 'FastAPI', 'Chrome Extension', 'Electron', 'React'],
    tags: ['ml', 'security', 'explainability'],
    // The repo is named TIS but the product is PhishingNet — both must resolve.
    aliases: [
      'TIS',
      'phishing analyzer',
      'phishing detector',
      'email analyzer',
      'Grammarly for phishing',
      'phishing net',
      'chrome extension',
      'gmail',
      'outlook',
    ],
    highlights: [
      'Interpretability first: every attribute score comes back with character-offset evidence spans, and the classifier reports the exact coefficient x tf-idf contribution of each keyword that moved its prediction.',
      'Scores 0.9912 F1 (classifier alone) and 0.9820 F1 (combined tool) on a 10,122-email held-out set drawn from six public corpora.',
      'The evaluation deliberately surfaces its own weakness: the legitimate baseline is 2000s Enron corporate mail, so the model partly learns "corporate style = safe". That leakage is measured per-source and documented rather than hidden.',
      'Attribute scorers are independent, testable modules, and the lexicons were validated by frequency-lift against real phishing samples instead of being guessed.',
      'Published on the Chrome Web Store: it reads each email you open in Gmail or Outlook and shows an inline verdict together with the reasons behind it.',
    ],
    links: {
      repo: 'https://github.com/dubaiplayer/TIS',
      // `demo` is the thing a visitor can actually use; `docs` is the write-up.
      demo: 'https://chromewebstore.google.com/detail/phishingnet/pahcbnmanmlfifmjbklpelljmbdfbdmh',
      docs: 'https://dubaiplayer.github.io/TIS/',
      // Internal route: the full project page (src/PhishingNet/PhishingNet.jsx).
      page: '/phishingnet',
      writeup: '/files/phishingnet/PhishingNet-Research-Paper.pdf',
    },
    // Explicit `sources` for two reasons:
    //  1. It pins scraping to the GitHub Pages docs, which is real authored
    //     content. The Chrome Web Store listing in `links.demo` must NOT be
    //     scraped — 5k chars of Google's own store chrome ("Add to Chrome",
    //     related extensions, privacy boilerplate) would poison the index.
    //  2. `fallback: 'error'` because the Pages site IS server-rendered today;
    //     if it ever regresses to a client-rendered shell the run should fail
    //     loudly rather than quietly indexing nothing but a <title>.
    sources: [
      { type: 'github_repo', url: 'https://github.com/dubaiplayer/TIS' },
      { type: 'live_demo', url: 'https://dubaiplayer.github.io/TIS/', fallback: 'error' },
      // From the research paper and the /phishingnet page. Keep in sync with both.
      {
        type: 'authored',
        text: `PhishingNet has its own project page on this site at /phishingnet, with screenshots, results, a dev log and the full research paper as a PDF. The research paper was written in July 2026 with mentor Siddarth Mohapatra. The problem: built-in filters in Gmail and Outlook are black boxes that block or allow email without saying why, so people never learn the warning signs, and heavy workload makes people more vulnerable to phishing. Data: 67,472 emails from six public datasets (Enron, CEAS-08, Ling-Spam, Nazario, a Nigerian-fraud set, SpamAssassin), split into 47,230 training, 10,120 validation and 10,122 test emails. Results on the 10,122 unseen test emails: accuracy 0.9925, precision 0.9916, recall 0.9907, F1 0.9912, ROC-AUC 0.9995. Retraining with genuine transactional email cut false positives on that kind of mail from 79% to 0%. Design decisions: TF-IDF with logistic regression was chosen over CNNs, BERT and LLM APIs because it is accurate, fast, small and interpretable, and an LLM API would send private email to a third party. Noisy-OR was chosen over averaging so one strong signal can raise the risk on its own. Verdict bands: below 0.35 legitimate, 0.6 and above phishing, otherwise suspicious. A browser extension was chosen over a website or a Gmail add-on. Ethics and privacy: trained only on public anonymised datasets; the extension checks only the open email, analyses it in memory and does not store it; it is advisory and never deletes or reports email.`,
      },
      {
        type: 'authored',
        text: `Current research and testing next: Devesh is running an online study asking whether explaining why an email is suspicious helps people more than a simple phishing or not phishing label. Participants sort 30 realistic but fake work emails on their own device from a link, in three parts: no help as a baseline; then with the tool, where half see only the verdict and half also see the reasons with warning signs highlighted; then no help again to test whether they learned. It measures accuracy, risky actions such as clicking a scam link, false alarms and confidence, with no real emails and no personal data. The study is built and launching after ethics review. Future work: brand-impersonation detection and Outlook support are done; still planned are feeding link destination domain age into the score, catching phishing in images, QR codes and attachments, supporting other languages and retraining on new tactics.`,
      },
    ],
    cover: null,
  },

  {
    id: 'portfolio-site',
    title: 'Portfolio Site',
    tagline: 'This site — a React SPA with a RAG chatbot that answers questions about my work.',
    description: `A personal portfolio built with React and Vite and deployed on Vercel.
It includes a retrieval-augmented chatbot that answers questions about my projects,
grounded in my own project notes and the READMEs of the repos behind them. Retrieval is
hybrid — keyword scoring plus embeddings — and the index is built ahead of time by a
script rather than scraped live, so answers are fast and the bot can cite its sources.`,
    role: 'Solo',
    status: 'wip',
    featured: true,
    year: 2026,
    tech: ['React', 'Vite', 'React Router', 'Vercel Functions', 'RAG'],
    tags: ['web', 'ai'],
    aliases: ['portfolio', 'this site', 'the chatbot', 'personal website', 'rag bot'],
    highlights: [
      'Hybrid retrieval: BM25 keyword scoring fused with embeddings, so a rate-limited embedding API degrades quality instead of breaking the bot.',
      'The projects data file is the single source of truth — it renders the Work page, builds the retrieval index, and generates the prompt catalog.',
      'The full project roster is injected into every prompt, which is what lets the bot answer "what have you built?" — a question top-k retrieval fails at by construction.',
    ],
    links: {
      repo: 'https://github.com/dubaiplayer/portfolio',
      demo: 'https://deveshgupta.vercel.app',
      writeup: null,
    },
    cover: null, // TODO: '/projects/portfolio-site.png'
  },

  {
    id: 'agentdock',
    title: 'AgentDock',
    tagline: 'A task-delegation bulletin board where AI agents hand work to each other.',
    description: `A shared, stateless place for AI agents to delegate asynchronously. Any agent
can post a task it needs help with; others discover open tasks, claim one, and post a result
back. Node and Express with SQLite through Node's built-in module, so installing it pulls
Express and nothing else. Agent-facing documentation is served live from the API itself,
and a read-only browser dashboard shows tasks moving from open to claimed to done.`,
    role: 'Solo',
    // The code is complete but the Railway deployment is gone — 'live' would
    // be misleading. Change this if you redeploy it.
    status: 'archived',
    featured: true,
    year: 2026,
    tech: ['Node.js', 'Express', 'SQLite'],
    tags: ['ai', 'api', 'agents'],
    aliases: ['NANDA', 'agent dock', 'agent tasks', 'task board', 'agent delegation', 'bulletin board'],
    highlights: [
      "Uses Node's built-in node:sqlite rather than better-sqlite3 specifically to avoid native compilation, so npm install cannot fail on an unfamiliar machine or host.",
      'Serves its own agent-facing skill documentation from a live endpoint, so an agent can discover how to use the API without out-of-band docs.',
      'Deliberately unauthenticated as an MVP — the friction of auth would have defeated the point of a drop-in coordination surface.',
    ],
    links: {
      // The README's Railway URL is dead. Leaving `demo` null is deliberate:
      // ingest hard-fails on a non-200 source, so a stale link breaks the build.
      repo: 'https://github.com/dubaiplayer/NANDA',
      demo: null,
      writeup: null,
    },
    cover: null,
  },

  {
    id: 'lyricmatcher',
    title: 'Resonate',
    tagline: 'Recommends songs by what the lyrics actually say, not by genre or listening history.',
    description: `A recommender that works from lyrical content rather than collaborative
filtering. Name a song and artist and it returns five tracks whose lyrics carry a similar
emotional register. Matching blends three signals — word-level TF-IDF, character-level
TF-IDF, and MiniLM sentence embeddings — weighted 30/20/50, with a small same-artist bonus
and a penalty that stops identical titles dominating the results. Songs are looked up by
fuzzy match, and anything missing from the dataset is fetched from Genius on demand and
folded into the index. A FastAPI backend serves a Vite/TypeScript/Tailwind frontend, which
also resolves YouTube links and cover art for each recommendation.`,
    role: 'Solo',
    status: 'live',
    featured: true,
    year: 2026,
    tech: ['Python', 'FastAPI', 'sentence-transformers', 'scikit-learn', 'TypeScript', 'React'],
    tags: ['ml', 'recommender', 'nlp'],
    // Deployed as "Resonate"; the repo is `lyricmatcher` and the API calls
    // itself "Recommendr" — all three names have to resolve to this project.
    aliases: [
      'lyricmatcher',
      'lyric matcher',
      'recommendr',
      'music recommender',
      'song recommender',
      'lyrics',
      'emotion music',
    ],
    highlights: [
      'Embeddings and TF-IDF matrices are cached to disk and keyed by a dataset signature hash, with an incremental path that re-encodes only appended rows instead of the whole corpus.',
      'Songs missing from the dataset are fetched from the Genius API at query time, appended, and re-indexed — so an unknown song is a cache miss rather than a failure.',
      'Fuzzy song lookup means a near-miss on spelling or punctuation still finds the track.',
    ],
    links: {
      repo: 'https://github.com/dubaiplayer/lyricmatcher',
      demo: 'https://lyric-recommendr.vercel.app',
      writeup: null,
    },
    cover: null,
  },
];

/** Work page ordering: featured first, then newest. Explicit so that reordering
 *  the array above (e.g. for ingest) can never reshuffle the UI. */
export function sortedProjects() {
  return [...projects].sort(
    (a, b) => Number(b.featured) - Number(a.featured) || b.year - a.year
  );
}

export default projects;
