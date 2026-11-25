import { describe, expect, it } from 'vitest'
import { checkVideoShape, whyMediaFromKey, whyMediaKindOf } from './why-media'

describe('whyMediaFromKey', () => {
  it('has nothing for no key', () => {
    expect(whyMediaFromKey(null)).toBeNull()
  })

  it('reads the kind from the key, so stored photos keep working unchanged', () => {
    expect(whyMediaKindOf('site/why-0123456789abcdef.mp4')).toBe('video')
    expect(whyMediaKindOf('site/why-0123456789abcdef.webp')).toBe('image')
    expect(whyMediaKindOf('site/why.webp')).toBe('image')
  })

  it('builds the public URL', () => {
    expect(whyMediaFromKey('site/why-0123456789abcdef.mp4')).toEqual({
      kind: 'video',
      url: expect.stringMatching(/site\/why-0123456789abcdef\.mp4$/),
    })
  })
})

describe('checkVideoShape', () => {
  const ok = { durationMs: 20_000, width: 1080, height: 1080 }

  it('accepts a square clip up to 20 seconds, with 100 ms for encoder rounding', () => {
    expect(checkVideoShape(ok)).toBeNull()
    expect(checkVideoShape({ ...ok, durationMs: 20_100 })).toBeNull()
  })

  it('refuses a clip over the limit', () => {
    expect(checkVideoShape({ ...ok, durationMs: 20_101 })).toBe('Video longer than 20 seconds.')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])('refuses an unreadable duration (%s)', (durationMs) => {
    expect(checkVideoShape({ ...ok, durationMs })).toBe('Could not read the video length.')
  })

  it('allows 1% (at least 1 px) off square, and no more', () => {
    expect(checkVideoShape({ ...ok, height: 1090 })).toBeNull()
    expect(checkVideoShape({ ...ok, height: 1091 })).toBe('Video must be square (1:1).')
    expect(checkVideoShape({ ...ok, width: 100, height: 101 })).toBeNull()
    expect(checkVideoShape({ ...ok, width: 1080, height: 1920 })).toBe('Video must be square (1:1).')
  })

  it('refuses a size it could not read', () => {
    expect(checkVideoShape({ ...ok, width: 0, height: 0 })).toBe('Could not read the video size.')
  })
})
