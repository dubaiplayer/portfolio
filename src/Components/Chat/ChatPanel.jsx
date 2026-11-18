import React, { useEffect, useRef, useState } from 'react'
import './ChatPanel.css'
import { Message } from './Message'
import { Composer } from './Composer'
import { useStickyScroll } from './useStickyScroll'
import { useFocusTrap } from './useFocusTrap'
import { starterQuestions } from '../../data/suggestions'
import { profile } from '../../data/profile'

const ERROR_COPY = {
  rate_limit: 'Too many questions right now.',
  network: "Couldn't reach the server.",
  server: 'The chat is taking a break.',
}

function ErrorRow({ error, onRetry }) {
  const [left, setLeft] = useState(error.retryAfter || 0)

  useEffect(() => {
    if (!error.retryAfter) return
    setLeft(error.retryAfter)
    const t = setInterval(() => setLeft((n) => (n <= 1 ? 0 : n - 1)), 1000)
    return () => clearInterval(t)
  }, [error])

  const limited = error.kind === 'rate_limit' && left > 0

  return (
    <div className="dgchat_error" role="status">
      <span>
        {ERROR_COPY[error.kind] || 'Something went wrong.'}
        {limited && ` Try again in ${left}s.`}
      </span>
      <span className="dgchat_error_actions">
        {!limited && (
          <button type="button" className="dgchat_link_btn" onClick={onRetry}>
            Retry
          </button>
        )}
        {error.kind === 'server' && profile.email && (
          <a className="dgchat_link_btn" href={`mailto:${profile.email}`}>
            Email instead
          </a>
        )}
      </span>
    </div>
  )
}

export default function ChatPanel({
  messages,
  status,
  error,
  send,
  retry,
  stop,
  clear,
  maxInput,
  open,
  onClose,
  isMobile,
  panelId,
  headingId,
}) {
  const panelRef = useRef(null)
  const busy = status === 'sending' || status === 'streaming'

  const { listRef, contentRef, onScroll, showJump, toBottom, forceStick } = useStickyScroll([
    messages.length,
    messages[messages.length - 1]?.content?.length,
  ])

  useFocusTrap(panelRef, isMobile)

  /* Screen readers: announce once when a reply starts and once when it lands.
     Putting aria-live on the growing text node itself would re-announce the
     entire message on every update and make the widget unusable. */
  const [announcement, setAnnouncement] = useState('')
  const lastDone = useRef(null)
  useEffect(() => {
    if (status === 'sending') setAnnouncement('Thinking…')
  }, [status])
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant' && last.status === 'done' && lastDone.current !== last.id) {
      lastDone.current = last.id
      setAnnouncement(last.content)
    }
  }, [messages])

  const handleSend = (text) => {
    forceStick()
    send(text)
  }

  const empty = messages.length === 0

  return (
    <div
      ref={panelRef}
      id={panelId}
      className="dgchat_panel"
      role="dialog"
      aria-labelledby={headingId}
      aria-modal={isMobile ? 'true' : undefined}
    >
      <header className="dgchat_header">
        <div>
          <h2 id={headingId} className="dgchat_title">
            Ask about {profile.name.split(' ')[0]}'s work
          </h2>
          <p className="dgchat_disclosure">AI assistant — can be wrong. Check the linked repos.</p>
        </div>
        <div className="dgchat_header_actions">
          {!empty && (
            <button type="button" className="dgchat_icon_btn" onClick={clear} aria-label="Clear conversation">
              ⟲
            </button>
          )}
          <button type="button" className="dgchat_icon_btn" onClick={onClose} aria-label="Close chat">
            ✕
          </button>
        </div>
      </header>

      <div
        className="dgchat_list"
        ref={listRef}
        onScroll={onScroll}
        aria-busy={busy ? 'true' : 'false'}
      >
        <div ref={contentRef}>
          {empty && (
            <div className="dgchat_empty">
              <p className="dgchat_empty_lead">
                I answer from {profile.name.split(' ')[0]}'s actual projects and notes — not from
                the open internet.
              </p>
              <ul className="dgchat_suggestions">
                {starterQuestions.map((q) => (
                  <li key={q}>
                    <button type="button" className="dgchat_suggestion" onClick={() => handleSend(q)}>
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m) => (
            <Message key={m.id} message={m} onNavigate={isMobile ? onClose : undefined} />
          ))}

          {status === 'sending' && (
            <div className="dgchat_msg dgchat_msg_bot">
              <div className="dgchat_typing" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          {error && <ErrorRow error={error} onRetry={retry} />}
        </div>
      </div>

      {showJump && (
        <button type="button" className="dgchat_jump" onClick={toBottom}>
          ↓ New message
        </button>
      )}

      <div className="dgchat_sr_only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <Composer
        onSend={handleSend}
        onStop={stop}
        busy={busy}
        disabled={false}
        maxInput={maxInput}
        /* Keyed on `open`, not on mount: the panel stays mounted after the
           first open (so scroll position survives), so a mount-only focus
           would fire exactly once and never again on reopen. Skipped on
           mobile, where focusing raises the keyboard over the transcript. */
        autoFocus={open && !isMobile}
      />
    </div>
  )
}
