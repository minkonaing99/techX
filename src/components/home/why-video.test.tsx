// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

let reduceMotion = false
vi.mock('framer-motion', () => ({ useReducedMotion: () => reduceMotion }))

const { WhyVideo } = await import('./why-video')

class FakeObserver {
  static all: FakeObserver[] = []
  observed: Element[] = []
  disconnected = false
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeObserver.all.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true
  }
  takeRecords() {
    return []
  }
  fire(isIntersecting: boolean) {
    act(() => {
      this.callback([{ isIntersecting, target: this.observed[0] } as IntersectionObserverEntry], this as never)
    })
  }
}

const near = () => FakeObserver.all.find((o) => o.options.rootMargin)!
const inView = () => FakeObserver.all.filter((o) => !o.options.rootMargin).at(-1)!
const video = () => document.querySelector('video')!

let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>

beforeEach(() => {
  reduceMotion = false
  FakeObserver.all = []
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  // jsdom has no media playback; fire the events a browser would.
  play = vi.fn(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  })
  pause = vi.fn(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as never)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause as never)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const SRC = 'https://cdn.example/site/why-0123456789abcdef.mp4'

describe('WhyVideo', () => {
  it('loads nothing until the section nears the screen', () => {
    render(<WhyVideo src={SRC} label="Why TechX" />)
    expect(video().getAttribute('src')).toBeNull()
    expect(video().getAttribute('preload')).toBe('none')
  })

  it('starts loading near the screen, from the first frame, and stops watching for nearness', () => {
    render(<WhyVideo src={SRC} label="Why TechX" />)
    near().fire(true)
    expect(video().getAttribute('src')).toBe(`${SRC}#t=0.001`)
    expect(near().disconnected).toBe(true)
  })

  it('plays while on screen and pauses when scrolled away', () => {
    render(<WhyVideo src={SRC} label="Why TechX" />)
    near().fire(true)
    inView().fire(true)
    expect(play).toHaveBeenCalled()
    inView().fire(false)
    expect(pause).toHaveBeenCalled()
  })

  it('is muted, loops, plays inline, has no native controls and is labelled', () => {
    render(<WhyVideo src={SRC} label="Why TechX" />)
    near().fire(true)
    expect(video().muted).toBe(true)
    expect(video().loop).toBe(true)
    expect(video().hasAttribute('playsinline')).toBe(true)
    expect(video().hasAttribute('controls')).toBe(false)
    expect(video().getAttribute('aria-label')).toBe('Why TechX')
  })

  it('lets the visitor pause it, and keeps it paused when it comes back on screen', () => {
    render(<WhyVideo src={SRC} label="Why TechX" />)
    near().fire(true)
    inView().fire(true)
    fireEvent.click(screen.getByRole('button', { name: 'Pause video' }))
    expect(pause).toHaveBeenCalled()
    play.mockClear()
    inView().fire(false)
    inView().fire(true)
    expect(play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    expect(play).toHaveBeenCalled()
  })

  it('does not autoplay for reduced motion, but still shows the first frame and can be played', () => {
    reduceMotion = true
    render(<WhyVideo src={SRC} label="Why TechX" />)
    near().fire(true)
    inView().fire(true)
    expect(video().getAttribute('src')).toBe(`${SRC}#t=0.001`)
    expect(play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    expect(play).toHaveBeenCalled()
  })

  it('pauses if reduced motion is switched on while it plays', () => {
    const { rerender } = render(<WhyVideo src={SRC} label="Why TechX" />)
    near().fire(true)
    inView().fire(true)
    pause.mockClear()
    reduceMotion = true
    rerender(<WhyVideo src={SRC} label="Why TechX" />)
    expect(pause).toHaveBeenCalled()
  })

  it('swallows a refused autoplay (Low Power Mode), and its Play button then really plays', async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))
    render(<WhyVideo src={SRC} label="Why TechX" />)
    near().fire(true)
    inView().fire(true)
    await act(async () => {})
    expect(play).toHaveBeenCalledTimes(1)
    // A tap is a user gesture, which the browser lets through.
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    expect(play).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Pause video' })).toBeTruthy()
  })

  it('stops observing when it leaves the page', () => {
    const { unmount } = render(<WhyVideo src={SRC} label="Why TechX" />)
    near().fire(true)
    unmount()
    expect(FakeObserver.all.every((o) => o.disconnected)).toBe(true)
  })
})
