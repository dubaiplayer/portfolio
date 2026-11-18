import { useEffect, useState } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus trap — deliberately MOBILE ONLY.
 *
 * On mobile the panel is a full-screen sheet: it genuinely is modal, so
 * trapping focus and announcing aria-modal are both truthful.
 *
 * On desktop it is a non-modal popover floating over a page that remains
 * perfectly usable. Setting aria-modal="true" there would tell a screen-reader
 * user the rest of the page is inert when it isn't, and trapping focus would
 * stop a keyboard user tabbing back to the navbar. So the caller passes
 * `active` from a matchMedia check rather than always-on.
 */
export function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || !ref.current) return
    const root = ref.current

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const items = [...root.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )
      if (!items.length) return

      const first = items[0]
      const last = items[items.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    root.addEventListener('keydown', onKeyDown)
    return () => root.removeEventListener('keydown', onKeyDown)
  }, [ref, active])
}

const SHEET_QUERY = '(max-width: 640px)'

/** True while the viewport is in the full-screen-sheet breakpoint. */
export function useIsMobileSheet() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(SHEET_QUERY).matches
  )

  useEffect(() => {
    const mq = window.matchMedia(SHEET_QUERY)
    const on = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', on)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', on)
  }, [])

  return isMobile
}
