import { describe, expect, it } from 'vitest'
import { REJECTION_PRESETS, composeRejectionReason } from './slip-rejection'

const AMOUNT = REJECTION_PRESETS.find((p) => p.id === 'amount')!

describe('composeRejectionReason', () => {
  it('uses a preset as it is', () => {
    expect(composeRejectionReason('amount', '')).toBe(AMOUNT.text)
  })

  it('adds the details after a preset', () => {
    expect(composeRejectionReason('amount', '  You sent 540,000, the total is 548,000. ')).toBe(
      `${AMOUNT.text} You sent 540,000, the total is 548,000.`,
    )
  })

  it('takes the details alone for "Other"', () => {
    expect(composeRejectionReason('other', ' The slip is from another order. ')).toBe('The slip is from another order.')
  })

  it('has no reason without a choice, or "Other" with nothing written', () => {
    expect(composeRejectionReason(null, 'something')).toBeNull()
    expect(composeRejectionReason('other', '   ')).toBeNull()
    expect(composeRejectionReason('nope', 'x')).toBeNull()
  })

  it('offers the four presets the plan names', () => {
    expect(REJECTION_PRESETS.map((p) => p.id)).toEqual(['amount', 'account', 'unreadable', 'not_found'])
  })
})
