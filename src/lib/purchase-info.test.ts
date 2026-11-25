import { describe, expect, it } from 'vitest'
import { deliveryLine, paymentLine, warrantyLine } from './purchase-info'

describe('deliveryLine', () => {
  it('gives the fee range, the timing and where it cannot go yet', () => {
    expect(
      deliveryLine({ min: 3_000, max: 8_500 }, ['Kayah State', 'Kayin State', 'Sagaing Region']),
    ).toBe(
      'Ks 3,000 to Ks 8,500 by division, added at checkout. Usually 1 to 4 days, remote townships up to a week. Not yet to Kayah State, Kayin State or Sagaing Region.',
    )
  })

  it('gives one fee when every division costs the same, and no gap list when there is none', () => {
    expect(deliveryLine({ min: 5_000, max: 5_000 }, [])).toBe(
      'Ks 5,000, added at checkout. Usually 1 to 4 days, remote townships up to a week.',
    )
  })

  it('still says the fee comes at checkout without fees to show', () => {
    expect(deliveryLine(null, ['Kayah State'])).toBe(
      'By division, added at checkout. Usually 1 to 4 days, remote townships up to a week. Not yet to Kayah State.',
    )
  })

  it('joins two places with "or"', () => {
    expect(deliveryLine(null, ['Kayah State', 'Kayin State'])).toMatch(/Not yet to Kayah State or Kayin State\.$/)
  })
})

describe('warrantyLine', () => {
  const base =
    'A factory fault in the first two weeks: we refund or replace it. After that, the manufacturer warranty'

  it('states the policy without promising a period it does not know', () => {
    expect(warrantyLine([{ label: 'Layout', value: '75%' }])).toBe(`${base}, claimed through us.`)
  })

  it('drops a period too long to be a period, rather than promise it beside the buttons', () => {
    expect(warrantyLine([{ label: 'Warranty', value: 'x'.repeat(41) }])).toBe(`${base}, claimed through us.`)
    for (const value of ['None', 'n/a', 'N/A', '-', 'no']) {
      expect(warrantyLine([{ label: 'Warranty', value }]), value).toBe(`${base}, claimed through us.`)
    }
  })

  it('adds the period from a Warranty spec', () => {
    expect(warrantyLine([{ label: ' warranty ', value: ' 1 year ' }])).toBe(`${base} (1 year), claimed through us.`)
  })
})

describe('paymentLine', () => {
  const all = { wallet: true, cod: true, codMinFee: 3_000 }

  it('offers cash on delivery under the cap', () => {
    expect(paymentLine({ ...all, unitPrice: 80_000 })).toBe(
      'Mobile wallet or bank transfer, or cash on delivery in Yangon and Mandalay for orders up to Ks 500,000 including delivery.',
    )
  })

  it('says cash on delivery is not offered when one unit and delivery pass the cap', () => {
    const over = 'Mobile wallet or bank transfer. Cash on delivery stops at Ks 500,000, so it is not offered for this item.'
    expect(paymentLine({ ...all, unitPrice: 545_000 })).toBe(over)
    expect(paymentLine({ ...all, unitPrice: 498_000 })).toBe(over)
    expect(paymentLine({ ...all, unitPrice: 497_000 })).not.toBe(over)
  })

  it('names only the methods that are switched on', () => {
    expect(paymentLine({ ...all, wallet: false, unitPrice: 80_000 })).toBe(
      'Cash on delivery in Yangon and Mandalay for orders up to Ks 500,000 including delivery.',
    )
    expect(paymentLine({ ...all, cod: false, unitPrice: 80_000 })).toBe('Mobile wallet or bank transfer.')
    expect(paymentLine({ ...all, codMinFee: null, unitPrice: 80_000 })).toBe('Mobile wallet or bank transfer.')
  })

  it('says nothing when no method is on', () => {
    expect(paymentLine({ wallet: false, cod: false, codMinFee: null, unitPrice: 80_000 })).toBeNull()
  })

describe('paymentLine for a monitor', () => {
  const all = { wallet: true, cod: true, codMinFee: 3_000 }

  it('says cash on delivery is not offered, whatever the price', () => {
    expect(paymentLine({ ...all, unitPrice: 80_000, noCod: true })).toBe(
      'Mobile wallet or bank transfer. Cash on delivery is not offered for monitors.',
    )
    expect(paymentLine({ ...all, wallet: false, unitPrice: 80_000, noCod: true })).toBe(
      'Cash on delivery is not offered for monitors.',
    )
  })
})
})
