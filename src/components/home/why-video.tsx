'use client'

import { useReducedMotion } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/*
 * The Why panel's video: muted, looping, inline, no native controls. It loads
 * only when the section nears the screen and plays only while it is on screen,
 * so a visitor who never scrolls there downloads nothing. Reduced-motion
 * visitors get the paused first frame. The small button is the WCAG 2.2.2 way
 * to stop a moving loop.
 */

interface WhyVideoProps {
  src: string
  label: string
}

/** Watches `el` and reports intersection changes; disconnects on cleanup. */
function observe(el: Element, options: IntersectionObserverInit, onChange: (hit: boolean, io: IntersectionObserver) => void) {
  const io = new IntersectionObserver(([entry], self) => {
    if (entry) onChange(entry.isIntersecting, self)
  }, options)
  io.observe(el)
  return () => io.disconnect()
}

export function WhyVideo({ src, label }: WhyVideoProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const reduce = useReducedMotion()
  const [near, setNear] = useState(false)
  const [onScreen, setOnScreen] = useState(false)
  const [playing, setPlaying] = useState(false)
  /** The visitor's own choice, which wins over the default (play unless reduced motion). */
  const [choice, setChoice] = useState<'play' | 'pause' | null>(null)
  const wantsPlay = choice ? choice === 'play' : !reduce

  function toggle() {
    const el = ref.current
    if (!el) return
    if (playing) {
      setChoice('pause')
      return
    }
    setChoice('play')
    // Called inside the tap, a user gesture, so it plays even where autoplay
    // was refused (iOS Low Power Mode) and the effect below would not re-run.
    el.muted = true
    el.play().catch(() => {})
  }

  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    return observe(el, { rootMargin: '300px 0px' }, (hit, io) => {
      if (!hit) return
      setNear(true)
      io.disconnect()
    })
  }, [near])

  useEffect(() => {
    const el = ref.current
    if (!el || !near) return
    return observe(el, { threshold: 0.25 }, (hit) => setOnScreen(hit))
  }, [near])

  useEffect(() => {
    const el = ref.current
    if (!el || !near) return
    // React's `muted` attribute does not always reach the element, and only a
    // muted video may autoplay.
    el.muted = true
    if (onScreen && wantsPlay) el.play().catch(() => {})
    else el.pause()
  }, [near, onScreen, wantsPlay])

  return (
    <div className="relative aspect-square overflow-hidden rounded-[var(--radius)] bg-sand">
      <video
        ref={ref}
        muted
        loop
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        preload={near ? 'metadata' : 'none'}
        src={near ? `${src}#t=0.001` : undefined}
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause video' : 'Play video'}
        className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink/55 text-cream backdrop-blur-sm transition-opacity hover:bg-ink/70"
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
    </div>
  )
}
