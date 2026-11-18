import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import './ChatWidget.css'
import { useChat } from './useChat'
import { useIsMobileSheet } from './useFocusTrap'

/* The panel is lazy, the bubble is not. On its own the panel is only a few KB,
   so what earns the split is (a) prefetch-on-intent below, which makes it
   invisible, and (b) it being the boundary you want already drawn the day a
   markdown renderer or syntax highlighting gets added. */
const ChatPanel = lazy(() => import('./ChatPanel'))
const prefetchPanel = () => import('./ChatPanel')

const PANEL_ID = 'dgchat-panel'
const HEADING_ID = 'dgchat-heading'

export const ChatWidget = () => {
  const [open, setOpen] = useState(false)
  /* Sticky: once opened, the panel stays mounted even when closed, so the
     scroll position survives and the chunk isn't refetched. */
  const [hasOpened, setHasOpened] = useState(false)

  const isMobile = useIsMobileSheet()
  const location = useLocation()
  const triggerRef = useRef(null)

  /* useChat lives HERE, not in ChatPanel. The panel unmounts when the lazy
     boundary tears down; if the conversation lived there, closing the panel
     would wipe the transcript. */
  const chat = useChat()

  const close = useCallback(() => setOpen(false), [])

  const toggle = () => {
    setHasOpened(true)
    setOpen((v) => !v)
  }

  /* Escape is bound at the document level: the panel may not hold focus (the
     visitor could be anywhere on the page behind a desktop popover). */
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  /* Restore focus to the bubble on close, so a keyboard user isn't dumped at
     the top of the document. */
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus()
    wasOpen.current = open
  }, [open])

  /* The mobile sheet is opaque and full-screen: following a citation while it
     is open would navigate behind it and look like nothing happened. */
  useEffect(() => {
    if (isMobile) setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.hash])

  /* Lock the page behind the sheet. Saved and restored rather than assumed,
     because App.css already ships an (unused) overflow:hidden rule. */
  useEffect(() => {
    if (!open || !isMobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, isMobile])

  /* Prefetch on intent — by the time anyone clicks, the chunk is cached. */
  useEffect(() => {
    const id = window.requestIdleCallback
      ? window.requestIdleCallback(() => prefetchPanel(), { timeout: 5000 })
      : setTimeout(prefetchPanel, 3000)
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id)
      else clearTimeout(id)
    }
  }, [])

  const panel =
    hasOpened &&
    createPortal(
      <div className={`dgchat ${open ? 'dgchat_is_open' : 'dgchat_is_closed'}`}>
        <Suspense fallback={<div className="dgchat_panel dgchat_panel_loading" />}>
          <ChatPanel
            {...chat}
            open={open}
            onClose={close}
            isMobile={isMobile}
            panelId={PANEL_ID}
            headingId={HEADING_ID}
          />
        </Suspense>
      </div>,
      document.body
    )

  return (
    <>
      {panel}
      <button
        ref={triggerRef}
        type="button"
        className="dgchat_bubble"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={open ? 'Close chat' : "Ask about Devesh's work"}
        onClick={toggle}
        onMouseEnter={prefetchPanel}
        onFocus={prefetchPanel}
        onTouchStart={prefetchPanel}
      >
        {open ? '✕' : '💬'}
      </button>
    </>
  )
}
