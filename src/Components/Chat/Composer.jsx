import React, { useEffect, useRef, useState } from 'react'

const ROWS_MAX = 4

export const Composer = ({ onSend, onStop, busy, disabled, maxInput, autoFocus }) => {
  const [value, setValue] = useState('')
  const ref = useRef(null)

  // Re-runs whenever autoFocus flips true, so reopening the panel refocuses.
  // (The panel stays mounted once opened, so a mount-only focus would fire once
  // and never again. Tab order while closed is handled by visibility:hidden.)
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  /* Auto-grow: reset to auto first, otherwise scrollHeight only ever ratchets up. */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * ROWS_MAX + 16)}px`
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (!text || busy || disabled) return
    setValue('')
    onSend(text)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const remaining = maxInput - value.length
  const nearLimit = remaining <= 100

  return (
    <form
      className="dgchat_composer"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label className="dgchat_sr_only" htmlFor="dgchat-input">
        Ask a question about Devesh's work
      </label>
      <textarea
        id="dgchat-input"
        ref={ref}
        className="dgchat_input"
        rows={1}
        value={value}
        placeholder={disabled ? 'Chat unavailable' : 'Ask about a project…'}
        maxLength={maxInput}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />

      {nearLimit && (
        <span className="dgchat_count" aria-live="polite">
          {remaining}
        </span>
      )}

      {busy ? (
        <button type="button" className="dgchat_send" onClick={onStop} aria-label="Stop generating">
          ■
        </button>
      ) : (
        <button
          type="submit"
          className="dgchat_send"
          disabled={!value.trim() || disabled}
          aria-label="Send message"
        >
          ↑
        </button>
      )}
    </form>
  )
}
