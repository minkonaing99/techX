import { describe, expect, it } from 'vitest'
import { cartAllowsCod } from './cod'

describe('cartAllowsCod', () => {
  it('allows cash on delivery for an ordinary cart', () => {
    expect(cartAllowsCod(['keyboards', 'mice'])).toBe(true)
    expect(cartAllowsCod([])).toBe(true)
  })

  // Only the client store's type leaves it optional; the server line requires it.
  it('treats a line with no category as ordinary', () => {
    expect(cartAllowsCod([undefined, 'mice'])).toBe(true)
  })

  it('never for a cart with a monitor in it', () => {
    expect(cartAllowsCod(['monitors'])).toBe(false)
    expect(cartAllowsCod(['mice', 'monitors'])).toBe(false)
  })
})
