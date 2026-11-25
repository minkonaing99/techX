'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'loading' | 'done'

const GIVE_UP_MS = 10_000
const FADE_MS = 300

function decoded(path: string): string {
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

/** Path and query in one comparable form, whichever side encoded it. */
function routeKey(pathname: string, search: string): string {
  return `${decoded(pathname)}?${new URLSearchParams(search).toString()}`
}

/**
 * A click that Next will turn into a page load inside the shop. It reads where
 * the link points, not what its handlers do, so a same-site link whose onClick
 * cancels the navigation would leave the bar up until GIVE_UP_MS.
 */
function startsNavigation(e: MouseEvent): boolean {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false
  const a = (e.target as Element | null)?.closest?.('a')
  if (!(a instanceof HTMLAnchorElement) || a.hasAttribute('download')) return false
  if (a.target && a.target !== '_self') return false
  let to: URL
  try {
    to = new URL(a.href, location.href)
  } catch {
    return false
  }
  if (to.origin !== location.origin) return false
  // Same page, or only the #hash differs: nothing loads.
  return routeKey(to.pathname, to.search) !== routeKey(location.pathname, location.search)
}

function barClass(phase: Phase): string {
  return cn(
    'pointer-events-none fixed top-0 left-0 z-[60] h-[2px] bg-accent motion-reduce:transition-none',
    phase === 'idle' && 'w-0 opacity-0',
    phase === 'loading' && 'w-[80%] opacity-100 transition-[width] duration-[8000ms] ease-out',
    phase === 'done' && 'w-full opacity-0 transition-[width,opacity] duration-300',
  )
}

/**
 * A thin bar along the top edge while the next page renders on the server.
 * Every page is dynamic, so after a tap the old page used to sit unchanged for
 * 0.3 s on wifi and a second or more on mobile data. Navigations started from
 * code (`router.push`) fire no click and show no bar.
 */
export function NavProgress() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const [phase, setPhase] = useState<Phase>('idle')
  const route = useRef(routeKey(pathname, search))
  const current = useRef<Phase>('idle')
  current.current = phase

  useEffect(() => {
    // From 'done' the bar is full width: drop to empty for a frame first, so it
    // grows again instead of shrinking back to 80 %.
    const start = () => {
      if (current.current !== 'done') return setPhase('loading')
      setPhase('idle')
      requestAnimationFrame(() => setPhase('loading'))
    }
    const onClick = (e: MouseEvent) => {
      if (startsNavigation(e)) start()
    }
    // Back and forward also fire for a #hash change, where nothing loads.
    const onPopState = () => {
      if (routeKey(location.pathname, location.search) !== route.current) start()
    }
    // Capture: Next's <Link> cancels the click before it would bubble here.
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  useEffect(() => {
    const next = routeKey(pathname, search)
    if (next === route.current) return
    route.current = next
    setPhase((p) => (p === 'loading' ? 'done' : p))
  }, [pathname, search])

  // A navigation that lands on the URL it started from never changes the
  // route; GIVE_UP_MS is what ends the bar then.
  useEffect(() => {
    if (phase === 'idle') return
    const t = setTimeout(() => setPhase('idle'), phase === 'done' ? FADE_MS : GIVE_UP_MS)
    return () => clearTimeout(t)
  }, [phase])

  return <div data-nav-progress data-state={phase} aria-hidden className={barClass(phase)} />
}
