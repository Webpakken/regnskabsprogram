import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Bruges på `PlatformShell` main (overflow) — skal matche `ScrollToTop`. */
export const PLATFORM_MAIN_SCROLL_ID = 'platform-main-scroll'

export function ScrollToTop() {
  const { pathname, search } = useLocation()

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    document.getElementById(PLATFORM_MAIN_SCROLL_ID)?.scrollTo(0, 0)
  }, [pathname, search])

  return null
}
