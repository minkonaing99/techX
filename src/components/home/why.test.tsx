// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Why } from './why'

class QuietObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Why panel', () => {
  it('shows a video for a video upload, with no photo', () => {
    vi.stubGlobal('IntersectionObserver', QuietObserver)
    const { container } = render(<Why media={{ kind: 'video', url: 'https://cdn.example/site/why-a.mp4' }} />)
    expect(container.querySelector('video')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows the photo for a photo upload', () => {
    vi.stubGlobal('IntersectionObserver', QuietObserver)
    const { container } = render(<Why media={{ kind: 'image', url: 'https://cdn.example/site/why-a.webp' }} />)
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Why TechX')
    expect(container.querySelector('video')).toBeNull()
  })

  it('falls back to the plain panel with nothing uploaded', () => {
    vi.stubGlobal('IntersectionObserver', QuietObserver)
    const { container } = render(<Why media={null} />)
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })
})
