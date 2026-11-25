import { describe, expect, it } from 'vitest'
import { safeCallback, withCallback } from './safe-callback'

describe('safeCallback', () => {
  it('follows a same-site path', () => {
    expect(safeCallback('/checkout')).toBe('/checkout')
    expect(safeCallback('/order/abc?x=1')).toBe('/order/abc?x=1')
  })

  it('falls back to the account without one', () => {
    expect(safeCallback(null)).toBe('/account')
    expect(safeCallback('')).toBe('/account')
  })

  it('never leaves the site', () => {
    for (const raw of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      'checkout',
    ]) {
      expect(safeCallback(raw), raw).toBe('/account')
    }
  })

  it('leaves encoded slashes alone: the browser keeps them in the path', () => {
    expect(safeCallback('/%2F%2Fevil.example')).toBe('/%2F%2Fevil.example')
    expect(safeCallback('/%5Cevil.example')).toBe('/%5Cevil.example')
  })
})

describe('withCallback', () => {
  it('carries the way back', () => {
    expect(withCallback('/signup', '/checkout')).toBe('/signup?callbackUrl=%2Fcheckout')
  })

  it('leaves the link plain for the default', () => {
    expect(withCallback('/signup', '/account')).toBe('/signup')
  })
})
