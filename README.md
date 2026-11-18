# Portfolio

React 18 + Vite SPA with a retrieval-augmented chatbot that answers questions about the projects, grounded in this repo's own project notes plus the READMEs and demo pages behind them.

```bash
yarn install
yarn dev            # app + /api on http://localhost:5173
```

---

## ⚠️ Do not add a credit card to the Groq account

This is the single most important operational rule in the project, and it is not a technical control.

`/api/chat` is a **public, unauthenticated LLM proxy**. It will eventually be found and hit by something automated. With no payment method on the Groq account, the worst case of any abuse is *"the chat is unavailable until the daily quota resets"*.

Everything in `api/_lib/guard.js` only reduces how often that happens. None of it can prevent a bill, because there cannot be one. If you ever do add a card, re-read that file and assume every limit in it is bypassable.

---

## How it works

```
src/data/projects.js ─┬─> src/Work/Work.jsx        (the Work page)
src/data/profile.js  ─┼─> scripts/ingest.mjs        (scrape → chunk → embed)
                      │        └─> api/_data/index.js   (committed index)
                      └─> api/chat.js               (project catalog in the prompt)
```

One data file feeds the page, the retrieval index, and the prompt, so the site and the bot cannot drift apart.

**Retrieval is hybrid**: BM25 keyword scoring fused with Gemini embeddings by reciprocal rank fusion. BM25 is the floor — if the embedding key is missing or rate-limited, retrieval degrades to keyword-only and the bot keeps working. A dense-only bot that gets a 429 tells visitors it knows nothing about its owner's projects.

**The full project roster is injected into every prompt.** Questions like *"what have you built?"* or *"which projects used React?"* are aggregate queries that top-k retrieval fails at by construction — the right answer is the whole list, and top-k returns five chunks. The catalog costs ~35 tokens per project and fixes the entire class.

**Scraped text is fenced with a per-request nonce** (`api/_lib/prompt.js`). READMEs and demo pages are untrusted input that reaches the model; a random closing marker cannot be forged by content that can't predict it.

---

## Setup

1. `cp .env.example .env.local` and fill it in.
2. **`LLM_API_KEY`** — [Groq](https://console.groq.com/keys). Free tier for `openai/gpt-oss-120b` is 30 req/min, 1,000 req/day, **8,000 tokens/min**. That TPM ceiling is the binding limit: roughly **2.4 questions/minute and ~60–70 conversation turns/day**. Hitting it is a normal code path — the widget has designed copy for 429/503, not a stack trace.
3. **`EMBED_API_KEY`** *(optional)* — [Google AI Studio](https://aistudio.google.com/apikey), for `gemini-embedding-001`. Without it everything still works on BM25 alone.
4. **`ALLOWED_ORIGINS`** — comma-separated. Empty disables the check (fine locally).
5. On Vercel, set `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `EMBED_API_KEY` and `ALLOWED_ORIGINS` for Production and Preview. `GITHUB_TOKEN` is **not** needed there — ingest never runs on Vercel.

### Swapping the model provider

`api/_lib/llm.js` is ~40 lines of `fetch` against the OpenAI-compatible chat API — no SDK. Together, OpenRouter, Cerebras, Fireworks and a local Ollama all speak the same format, so switching is two environment variables (`LLM_BASE_URL`, `LLM_MODEL`).

---

## Adding a project

Add an entry to `src/data/projects.js`, then:

```bash
yarn ingest:check   # validate schema, report problems, write nothing
yarn ingest         # fetch, chunk, embed, write api/_data/index.js
yarn eval           # offline retrieval check — no LLM, no cost
```

Commit `api/_data/index.js` and `scripts/.ingest-cache.json`. **The index is a snapshot: the bot is stale until you re-run `yarn ingest`.**

Fill in `aliases` — 3–6 things a visitor might actually call the project. It's what bridges "plane tracker" to `flight-tracker`, and it drives the named-project boost in retrieval. Thirty seconds per project, high leverage.

### If ingest fails on a demo URL

Client-rendered demos return an empty HTML shell. Ingest **fails the run** rather than warning, because a warning scrolling past the terminal is exactly how you ship an index that silently contains nothing. Resolve it per source in `projects.js`:

```js
sources: [
  { type: 'live_demo', url: '…', fallback: 'meta' },   // index <title>/<meta description> only
  { type: 'live_demo', url: '…', fallback: 'manual' }, // pair with an authored source
  { type: 'authored',  text: 'Three sentences you write by hand.' },
]
```

There is deliberately no headless browser here. Playwright would be ~300MB to scrape a handful of sites you wrote yourself, and the hand-written text is better than anything a scraper extracts.

---

## Filling in `profile.js`

Two different paths reach the model, and the difference decides where a fact belongs:

| | reaches the model via | good for |
|---|---|---|
| `name` `headline` `location` `bio` `skills` `education` `experience` `availability` `links` | the **trusted block**, injected into *every* prompt | short, high-frequency facts |
| `bio` + `skills` (one chunk), each `experience`, each `education`, each `faq` entry | the **retrieval index**, only when it wins a top-k slot | detail: coursework, highlights, long answers |

`education` is in **both**, deliberately. Every profile chunk shares the
`'__profile__'` retrieval key, so a growing FAQ can push education out of
retrieval entirely — the trusted line guarantees "where does he study?" is
answerable, the chunk supplies the detail.

```js
education: [{
  school: '…',          // required
  credential: '…',      // required — spell the degree out
  start: '2024-09',
  end: '2028-05',       // may be in the future
  status: 'in-progress',// required: 'in-progress' | 'completed'
  location: '…',  gpa: null,
  coursework: [], highlights: [], url: null,
}]
```

`status` exists because a student's `end` is a *future* date. The `experience[]`
idiom of "null means present" cannot express "expected 2028", and printing a
bare `2028-05` states a projection as fact — which Rule 2 of the system prompt
("never guess dates") forbids. `eduRange()` in `profile.js` renders it for the
page, the chunk and the prompt from one place so they cannot disagree.

**`faq` is the highest-leverage field in the file.** Each entry is its own
`authored` chunk, boosted 1.6x over anything scraped. With no work history it is
what does the talking — aim for 6–8 entries.

### Write for the retriever, not just for the reader

`tokenize()` in `api/_lib/bm25.js` does **no stemming**, and `where`/`does`/`he`
are stopwords — so *"where does he study?"* reduces to the single term `study`.
If the words a visitor types don't appear literally in a chunk (or in the
`TECH_SYNONYMS` expansion in `retrieve.js`), BM25 scores it zero. That is why
the education chunk says "student", "studying", "degree", "courses" and
"classes" in prose that reads slightly redundantly: the redundancy *is* the
retrieval, exactly as `aliases` works for projects. It is also why `coursework`
earns its place — real course titles are what let the bot answer "has he studied
ML?" on a keyword-only index.

`yarn ingest:check` warns when `profile.skills` and the `tech` arrays in
`projects.js` disagree in either direction, so the skills page and the bot can't
quietly understate what you've shipped.

## Constraints worth knowing before you change things

- **`src/data/projects.js` and `profile.js` must stay Node-importable.** They are imported by plain Node (ingest), by the Vercel function, and by React. One `import cover from './cover.png'` breaks two of the three, at runtime. Cover images are `public/` path strings. `yarn ingest:check` asserts this.
- **`vercel.json` uses `rewrites`, not `routes`.** The `(?!api/)` lookahead keeps `/api/*` from being rewritten to the HTML shell.
- **Package manager is yarn** (`corepack enable`). `yarn.lock` is committed and Vercel installs from it — running `npm install` would leave it stale and deploy without dependencies.
- **`useChat` lives in `ChatWidget`, not `ChatPanel`.** The panel is lazy and unmounts when closed; a conversation stored there would be wiped every time the visitor closes the chat.
- **Never set `scroll-behavior: smooth` on `.dgchat_list`.** Every update would become a queued 300ms animation and the auto-scroll stick detection reads positions mid-animation and lies.

## Scripts

| | |
|---|---|
| `yarn dev` | Vite + the `/api` dev shim (no `vercel dev` needed) |
| `yarn build` | production build — deliberately does **not** run ingest |
| `yarn ingest` | rebuild the retrieval index |
| `yarn ingest:force` | ignore caches, refetch and re-embed everything |
| `yarn ingest:check` | validate and report; writes nothing |
| `yarn eval` | offline retrieval evaluation |
