import { describe, expect, it } from 'vitest'
import { deliveryRange } from './delivery-range'

describe('deliveryRange', () => {
  it('spans the cheapest and dearest division', () => {
    expect(deliveryRange([{ deliveryFeeMmk: 3_000 }, { deliveryFeeMmk: 2_000 }, { deliveryFeeMmk: 5_000 }])).toEqual({
      min: 2_000,
      max: 5_000,
    })
  })

  it('collapses to one value when every division costs the same, or there is only one', () => {
    expect(deliveryRange([{ deliveryFeeMmk: 3_000 }, { deliveryFeeMmk: 3_000 }])).toEqual({ min: 3_000, max: 3_000 })
    expect(deliveryRange([{ deliveryFeeMmk: 4_500 }])).toEqual({ min: 4_500, max: 4_500 })
  })

  it('is null when there are no deliverable divisions', () => {
    expect(deliveryRange([])).toBeNull()
  })
})
