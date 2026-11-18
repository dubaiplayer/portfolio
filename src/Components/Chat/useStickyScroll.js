import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const STICK_PX = 64

/**
 * Keep the transcript pinned to the bottom without fighting the reader.
 *
 * Two things make or break this:
 *
 * 1. A ResizeObserver on the content wrapper is REQUIRED. When a reply is
 *    inserted or grows, no scroll event fires — a scroll-listener-only
 *    implementation silently stops following.
 *
 * 2. `scroll-behavior: smooth` must NEVER be set on the list. Every update
 *    would become a queued 300ms animation, and position readings taken
 *    mid-animation make the stick detection lie. Smooth belongs on the
 *    jump-to-latest button alone.
 */
export function useStickyScroll(deps = []) {
  const listRef = useRef(null)
  const contentRef = useRef(null)
  const stick = useRef(true)
  const [showJump, setShowJump] = useState(false)

  const toBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight // direct assignment, never scrollTo
    stick.current = true
    setShowJump(false)
  }, [])

  const onScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stick.current = distance <= STICK_PX
    setShowJump(!stick.current)
  }, [])

  /** Call when the USER sends: even if they had scrolled up to reread
   *  something, their own new message should bring them back down. */
  const forceStick = useCallback(() => {
    stick.current = true
    setShowJump(false)
  }, [])

  useLayoutEffect(() => {
    if (stick.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return

    const ro = new ResizeObserver(() => {
      if (stick.current && listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight
      }
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  return { listRef, contentRef, onScroll, showJump, toBottom, forceStick }
}
