import { describe, expect, it } from 'vitest'
import { isOfferable } from './payment-methods'

const BANK = { kind: 'wallet' as const, accountName: 'TechX', accountPhone: '0123456789', qrImageUrl: null }

describe('isOfferable', () => {
  it('offers a bank or wallet method without a QR - the QR is optional', () => {
    expect(isOfferable(BANK)).toBe(true)
  })

  it('offers one with a QR too', () => {
    expect(isOfferable({ ...BANK, qrImageUrl: 'payment-qr/kbz_pay-0123456789abcdef.webp' })).toBe(true)
  })

  it('hides a method the customer could not pay: no account name or number', () => {
    expect(isOfferable({ ...BANK, accountName: null })).toBe(false)
    expect(isOfferable({ ...BANK, accountPhone: null })).toBe(false)
    expect(isOfferable({ ...BANK, accountName: '  ' })).toBe(false)
    expect(isOfferable({ ...BANK, accountPhone: '' })).toBe(false)
  })

  it('always offers cash on delivery, which has no account to pay into', () => {
    expect(isOfferable({ kind: 'cod', accountName: null, accountPhone: null, qrImageUrl: null })).toBe(true)
  })
})
