import { useCallback, useEffect, useRef, useState } from 'react'
import { projects } from '../../data/projects'
import { loadThread, saveThread, clearThread } from './chatStorage'

/**
 * Conversation state and transport.
 *
 * IMPORTANT: this hook is called from ChatWidget, never from ChatPanel. The
 * panel is lazily mounted and unmounts when closed — if the conversation lived
 * there, closing the panel would silently wipe the transcript. That is the
 * single easiest bug to introduce in this architecture.
 */

const ENDPOINT = '/api/chat'
const HISTORY_LIMIT = 6 // 3 exchanges; matches the server-side cap
const MAX_INPUT = 500

const EMPTY_ANSWER =
  "I don't have anything on that in my notes. Try asking about one of the projects on the work page — or email me directly."

let seq = 0
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

class ChatError extends Error {
  constructor(kind, { retryAfter, message } = {}) {
    super(message || kind)
    this.kind = kind
    this.retryAfter = retryAfter
  }
}

/** Resolve citation chips against projects.js rather than trusting the server's
 *  strings — one source of truth for titles, and it guarantees every cited
 *  project also gets an internal /work link instead of leaking all the traffic
 *  to GitHub. */
function normaliseSources(sources, projectIds) {
  const ids = new Set([
    ...(projectIds || []),
    ...(sources || []).map((s) => s.projectId).filter(Boolean),
  ])

  const out = []
  const seen = new Set()

  for (const id of ids) {
    const p = projects.find((x) => x.id === id)
    if (!p) continue
    const add = (kind, url) => {
      const key = `${kind}:${url}`
      if (!url || seen.has(key)) return
      seen.add(key)
      out.push({ id, kind, url, title: p.title })
    }
    add('repo', p.links?.repo)
    add('demo', p.links?.demo)
    add('docs', p.links?.docs)
    add('work', `/work#project-${id}`)
  }
  return out
}

export function useChat() {
  const [messages, setMessages] = useState(() => loadThread()?.messages || [])
  const [status, setStatus] = useState('idle') // idle | sending | streaming | error
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const messagesRef = useRef(messages)
  const pinnedRef = useRef([])
  const saveTimer = useRef(0)

  messagesRef.current = messages

  /* Debounced persistence — never write on every keystroke or token. */
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveThread({ messages, threadId: null }), 400)
    return () => clearTimeout(saveTimer.current)
  }, [messages])

  const patch = useCallback((id, fields) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)))
  }, [])

  const run = useCallback(
    async (text, replyId) => {
      const ac = new AbortController()
      abortRef.current = ac
      setError(null)
      setStatus('sending')

      // Only the visible conversation is sent; the server caps it again.
      const history = messagesRef.current
        .filter((m) => m.status !== 'error' && m.content)
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.content }))

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          signal: ac.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, pinnedProjectIds: pinnedRef.current }),
        })

        if (res.status === 429) {
          throw new ChatError('rate_limit', {
            retryAfter: Number(res.headers.get('Retry-After')) || 30,
          })
        }
        if (res.status === 503) {
          throw new ChatError('server')
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new ChatError('server', { message: body.error })
        }

        const ct = res.headers.get('Content-Type') || ''

        /* The backend returns a single JSON body today. The SSE branch below
           exists so that flipping `stream: true` in api/_lib/llm.js is a
           server-only change — the client already handles both. */
        if (res.body && ct.includes('event-stream')) {
          await consumeStream(res, replyId, patch, setStatus)
        } else {
          const data = await res.json()
          const answer = (data.answer || '').trim()
          if (!answer) throw new ChatError('empty')

          pinnedRef.current = data.pinnedProjectIds || []
          patch(replyId, {
            content: answer,
            sources: normaliseSources(data.sources, data.pinnedProjectIds),
            status: 'done',
          })
        }

        setStatus('idle')
      } catch (err) {
        if (err.name === 'AbortError') {
          patch(replyId, { status: 'stopped' })
          setStatus('idle')
          return
        }
        const kind = err instanceof ChatError ? err.kind : 'network'

        /* "I found nothing" is the most common real failure, and it is not a
           crash — it renders as an ordinary assistant reply. Treating it as an
           error row makes a working bot look broken. */
        if (kind === 'empty') {
          patch(replyId, { content: EMPTY_ANSWER, status: 'done', sources: [] })
          setStatus('idle')
          return
        }

        patch(replyId, { status: 'error', content: '' })
        setError({ kind, retryAfter: err.retryAfter })
        setStatus('error')
      } finally {
        abortRef.current = null
      }
    },
    [patch]
  )

  const send = useCallback(
    (raw) => {
      const text = String(raw || '').trim().slice(0, MAX_INPUT)
      if (!text || status === 'sending' || status === 'streaming') return

      const userMsg = { id: nextId(), role: 'user', content: text, status: 'done', ts: Date.now() }
      const replyMsg = {
        id: nextId(),
        role: 'assistant',
        content: '',
        sources: [],
        status: 'streaming',
        ts: Date.now(),
      }

      setMessages((prev) => [...prev, userMsg, replyMsg])
      // messagesRef is updated by render, but `run` reads it immediately —
      // so update it here too rather than relying on the commit having landed.
      messagesRef.current = [...messagesRef.current, userMsg, replyMsg]

      run(text, replyMsg.id)
    },
    [run, status]
  )

  /** Retry reuses the failed assistant message rather than appending a new
   *  exchange — appending a duplicate user turn is the classic bug here. */
  const retry = useCallback(() => {
    const list = messagesRef.current
    const lastAssistant = [...list].reverse().find((m) => m.role === 'assistant')
    const lastUser = [...list].reverse().find((m) => m.role === 'user')
    if (!lastAssistant || !lastUser) return

    patch(lastAssistant.id, { status: 'streaming', content: '' })
    run(lastUser.content, lastAssistant.id)
  }, [patch, run])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
    setStatus('idle')
    pinnedRef.current = []
    clearThread()
  }, [])

  return { messages, status, error, send, retry, stop, clear, maxInput: MAX_INPUT }
}

/* -- SSE branch ------------------------------------------------------------ */

/**
 * Frames are delimited by a blank line and a network chunk can split one
 * mid-JSON, so the buffer/indexOf dance is not optional — `value.split('\n')`
 * works perfectly on localhost and corrupts under real network conditions.
 *
 * Tokens also arrive across `await` boundaries, which React 18's automatic
 * batching does NOT cover, so they are coalesced into one render per frame.
 */
async function consumeStream(res, replyId, patch, setStatus) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  let acc = ''
  let sources = []
  let pinned = []
  let raf = 0
  let pending = null

  const flush = () => {
    if (pending == null) return
    patch(replyId, { content: pending })
    pending = null
  }
  const schedule = (text) => {
    pending = text
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      flush()
    })
  }

  setStatus('streaming')

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value

    let nl
    while ((nl = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, nl)
      buf = buf.slice(nl + 2)

      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue

      let evt
      try {
        evt = JSON.parse(payload)
      } catch {
        continue // one malformed frame must not kill the stream
      }

      if (evt?.type === 'token') {
        acc += evt.text
        schedule(acc)
      } else if (evt?.type === 'sources') {
        sources = evt.sources || []
        pinned = evt.pinnedProjectIds || []
      } else if (evt?.type === 'error') {
        throw new ChatError(evt.code || 'server')
      }
    }
  }

  if (raf) cancelAnimationFrame(raf)
  flush() // without this the final frame's tokens are dropped

  if (!acc.trim()) throw new ChatError('empty')
  patch(replyId, {
    content: acc,
    sources: normaliseSources(sources, pinned),
    status: 'done',
  })
}
