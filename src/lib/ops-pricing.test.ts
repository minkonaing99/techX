import { describe, expect, it } from 'vitest'
import {
  PERCENT_MAX,
  PERCENT_MIN,
  ROUND_STEPS,
  changeProblem,
  planReprice,
  scalePrice,
  type RepriceProduct,
} from './ops-pricing'

function product(id: string, over: Partial<RepriceProduct> = {}): RepriceProduct {
  return { id, name: id, categoryId: 'keyboards', priceMmk: 100_000, salePriceMmk: null, isActive: true, ...over }
}

describe('scalePrice', () => {
  it('rounds to the nearest step', () => {
    expect(scalePrice(202_400, 0, 1000)).toBe(202_000)
    expect(scalePrice(202_600, 0, 1000)).toBe(203_000)
    expect(scalePrice(202_500, 0, 1000)).toBe(203_000)
  })

  it('works in whole numbers, so 10% of 1,000 is exactly 1,100', () => {
    // In floating point 1000 * 1.1 is 1100.0000000000002.
    expect(scalePrice(1000, 1000, 100)).toBe(1100)
  })

  it('rounds an exact half up even where floating point would land just below it', () => {
    // 20,000 x (1 - 0.4975) is exactly 10,050; as floats it is 10,049.999...,
    // which would round down to 10,000.
    expect(scalePrice(20_000, -4975, 100)).toBe(10_100)
  })

  it('raises and lowers by basis points', () => {
    expect(scalePrice(250_000, 800, 1000)).toBe(270_000)
    expect(scalePrice(250_000, -1000, 500)).toBe(225_000)
  })

  it('stays exact at the largest price the shop allows', () => {
    expect(scalePrice(999_000_000, 0, 1000)).toBe(999_000_000)
  })
})

describe('planReprice', () => {
  const opts = { percent: 8, roundTo: 1000 as const }

  it('scales price and sale by the same step, in product-id order', () => {
    const plan = planReprice(
      [product('wren', { priceMmk: 120_000, salePriceMmk: 90_000 }), product('alba', { priceMmk: 250_000 })],
      opts,
    )
    expect(plan.blocked).toEqual([])
    expect(plan.changes).toEqual([
      { id: 'alba', name: 'alba', priceWas: 250_000, salePriceWas: null, priceMmk: 270_000, salePriceMmk: null },
      { id: 'wren', name: 'wren', priceWas: 120_000, salePriceWas: 90_000, priceMmk: 130_000, salePriceMmk: 97_000 },
    ])
  })

  it('blocks the whole run when a sale would no longer be below its price', () => {
    // 10,400 and 10,000 both round to 10,000 at a 1,000 step.
    const plan = planReprice([product('a'), product('tight', { priceMmk: 10_400, salePriceMmk: 10_000 })], {
      percent: 0.01,
      roundTo: 1000,
    })
    expect(plan.blocked).toEqual([{ id: 'tight', name: 'tight', reason: expect.stringMatching(/sale/) }])
  })

  it('blocks a price that would fall below the rounding step', () => {
    const plan = planReprice([product('cheap', { priceMmk: 600 })], { percent: -50, roundTo: 1000 })
    expect(plan.blocked[0]).toMatchObject({ id: 'cheap', reason: expect.stringMatching(/below/) })
  })

  it('blocks a price that would pass the most the shop allows', () => {
    const plan = planReprice([product('huge', { priceMmk: 900_000_000 })], { percent: 100, roundTo: 1000 })
    expect(plan.blocked[0]).toMatchObject({ id: 'huge', reason: expect.stringMatching(/above/) })
  })

  it('leaves free products alone', () => {
    expect(planReprice([product('free', { priceMmk: 0 })], opts)).toEqual({ changes: [], blocked: [] })
  })

  it('leaves out products whose price would not change', () => {
    expect(planReprice([product('same', { priceMmk: 100_000 })], { percent: 0.1, roundTo: 1000 }).changes).toEqual([])
  })

  it('narrows to one category', () => {
    const plan = planReprice([product('kb'), product('mouse', { categoryId: 'mice' })], { ...opts, category: 'mice' })
    expect(plan.changes.map((c) => c.id)).toEqual(['mouse'])
  })

  it('includes hidden products unless told otherwise', () => {
    const list = [product('live'), product('hidden', { isActive: false })]
    expect(planReprice(list, opts).changes).toHaveLength(2)
    expect(planReprice(list, { ...opts, includeInactive: false }).changes.map((c) => c.id)).toEqual(['live'])
  })

  it('never produces a sale at or above its price without blocking it', () => {
    for (let i = 0; i < 500; i++) {
      const price = 1000 + ((i * 7919) % 900_000)
      const sale = Math.max(0, price - 1 - ((i * 104_729) % price))
      const percent = PERCENT_MIN + ((i * 37) % (PERCENT_MAX - PERCENT_MIN))
      const roundTo = ROUND_STEPS[i % ROUND_STEPS.length]!
      const plan = planReprice([product(`p${i}`, { priceMmk: price, salePriceMmk: sale })], { percent, roundTo })
      for (const c of plan.changes) {
        if (c.salePriceMmk !== null) expect(c.salePriceMmk).toBeLessThan(c.priceMmk)
      }
    }
  })
})

describe('changeProblem', () => {
  const base = { id: 'a', priceWas: 100, salePriceWas: null }

  it('accepts a sound change', () => {
    expect(changeProblem({ ...base, priceMmk: 120_000, salePriceMmk: 99_000 })).toBeNull()
  })

  it('refuses a price below 1 Ks', () => {
    expect(changeProblem({ ...base, priceMmk: 0, salePriceMmk: null })).toMatch(/at least 1/)
  })

  it('refuses a sale that is not below the price, in the shared wording', () => {
    expect(changeProblem({ ...base, priceMmk: 100_000, salePriceMmk: 100_000 })).toMatch(/below the normal price/)
  })
})

describe('planReprice and free sales', () => {
  it('blocks a sale that would round down to 0, which checkout would sell for nothing', () => {
    const plan = planReprice([product('tiny-sale', { priceMmk: 50_000, salePriceMmk: 400 })], { percent: -10, roundTo: 1000 })
    expect(plan.blocked[0]).toMatchObject({ id: 'tiny-sale', reason: expect.stringMatching(/round to 0/) })
  })

  it('leaves a sale that was already 0 at 0 without blocking the run', () => {
    const plan = planReprice([product('promo', { priceMmk: 50_000, salePriceMmk: 0 })], { percent: 10, roundTo: 1000 })
    expect(plan.blocked).toEqual([])
    expect(plan.changes[0]).toMatchObject({ priceMmk: 55_000, salePriceMmk: 0 })
  })
})

describe('changeProblem and free sales', () => {
  it('refuses setting a new sale of 0 - one typo would make the product free', () => {
    expect(changeProblem({ id: 'a', priceWas: 100, salePriceWas: null, priceMmk: 100_000, salePriceMmk: 0 })).toMatch(/at least 1/)
  })

  it('lets a product already on a 0 sale have its price changed', () => {
    expect(changeProblem({ id: 'a', priceWas: 100, salePriceWas: 0, priceMmk: 100_000, salePriceMmk: 0 })).toBeNull()
  })
})
