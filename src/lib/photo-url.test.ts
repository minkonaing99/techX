import { describe, expect, it } from 'vitest'
import { PHOTO_BASE, productPhotoUrl } from './types'

describe('productPhotoUrl', () => {
  it('versions the URL with the product timestamp, so a replaced photo is fetched again', () => {
    const at = '2026-10-23T08:00:00.000Z'
    expect(productPhotoUrl('keychron-k2-pro', '01.webp', at)).toBe(
      `${PHOTO_BASE}/keychron-k2-pro/01.webp?v=${Date.parse(at)}`,
    )
  })

  it('changes when the product changes', () => {
    const a = productPhotoUrl('k2', '01-thumb.webp', '2026-10-23T08:00:00.000Z')
    const b = productPhotoUrl('k2', '01-thumb.webp', '2026-10-23T08:00:01.000Z')
    expect(a).not.toBe(b)
  })

  it('leaves the version off an unreadable timestamp rather than writing NaN', () => {
    expect(productPhotoUrl('k2', '01.webp', 'not a date')).toBe(`${PHOTO_BASE}/k2/01.webp`)
  })
})
