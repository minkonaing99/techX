import { describe, expect, it } from 'vitest'
import { ORDER_STATUSES } from '@/db/schema/orders'
import {
  OPEN_ORDER_STATUSES,
  customerStatusHint,
  customerStatusLabel,
  listStatusLabel,
  owesPayment,
  paymentNote,
  progressSteps,
  shortOrderId,
  type MethodKind,
} from './order-status'

const KINDS: MethodKind[] = ['wallet', 'cod']

describe('customerStatusLabel', () => {
  it('returns a label for every status and payment kind', () => {
    for (const kind of KINDS) {
      for (const status of ORDER_STATUSES) {
        const label = customerStatusLabel(status, kind)
        expect(label, `${kind}/${status}`).toBeTruthy()
      }
    }
  })

  it('never leaks the raw enum to a customer', () => {
    for (const kind of KINDS) {
      for (const status of ORDER_STATUSES) {
        expect(customerStatusLabel(status, kind)).not.toContain('_')
      }
    }
  })

  it('does not tell a COD buyer that payment is awaited', () => {
    // The bug this module exists to prevent: COD buyers owe nothing until the
    // courier arrives, so "Awaiting payment" made them think they must transfer.
    expect(customerStatusLabel('pending_payment', 'cod')).toBe('Awaiting confirmation')
    expect(customerStatusLabel('pending_payment', 'wallet')).toBe('Awaiting payment')
  })

  it('reminds a COD buyer to have cash ready once confirmed', () => {
    expect(customerStatusLabel('confirmed', 'cod')).toMatch(/pay on delivery/i)
    expect(customerStatusLabel('confirmed', 'wallet')).toBe('Confirmed')
  })

  it('reads the same for both kinds once the order closes', () => {
    for (const status of ['delivered', 'cancelled'] as const) {
      expect(customerStatusLabel(status, 'cod')).toBe(customerStatusLabel(status, 'wallet'))
    }
  })
})

describe('shortOrderId', () => {
  it('takes the first 8 characters, uppercased', () => {
    expect(shortOrderId('1c34b3b6-1234-5678-9abc-def012345678')).toBe('1C34B3B6')
  })

  it('stops before the first dash, so the reference never reads as truncated', () => {
    expect(shortOrderId('1c34b3b6-1234-5678-9abc-def012345678')).not.toContain('-')
  })

  it('survives an id shorter than 8 characters', () => {
    expect(shortOrderId('abc')).toBe('ABC')
  })
})

describe('progressSteps', () => {
  it('gives a COD order no slip step - there is no slip to send', () => {
    const labels = progressSteps('confirmed', 'cod').map((s) => s.label)
    expect(labels).toEqual(['Order placed', 'Confirmed', 'Delivered'])
  })

  it('gives a wallet order the slip step', () => {
    const labels = progressSteps('confirmed', 'wallet').map((s) => s.label)
    expect(labels).toEqual(['Order placed', 'Payment sent', 'Confirmed', 'Delivered'])
  })

  it('marks exactly one step current, everything before it done', () => {
    const steps = progressSteps('confirmed', 'wallet')
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'todo'])
  })

  it('lands on the first step for a brand new order', () => {
    const steps = progressSteps('pending_payment', 'wallet')
    expect(steps[0]?.state).toBe('current')
    expect(steps.slice(1).every((s) => s.state === 'todo')).toBe(true)
  })

  it('has no pending step left once delivered', () => {
    for (const kind of KINDS) {
      const steps = progressSteps('delivered', kind)
      expect(steps.at(-1)?.state, kind).toBe('current')
      expect(steps.some((s) => s.state === 'todo'), kind).toBe(false)
    }
  })

  it('returns nothing for a cancelled order - it stopped, it did not progress', () => {
    for (const kind of KINDS) {
      expect(progressSteps('cancelled', kind), kind).toEqual([])
    }
  })

  it('never places a wallet-only status on a COD rail', () => {
    // payment_submitted cannot happen on COD, but a bad row must not crash or
    // silently mark every step done. It falls back to the first step.
    const steps = progressSteps('payment_submitted', 'cod')
    expect(steps[0]?.state).toBe('current')
  })

  it('marks exactly one step current for every live status', () => {
    for (const kind of KINDS) {
      for (const status of ORDER_STATUSES) {
        if (status === 'cancelled') continue
        const current = progressSteps(status, kind).filter((s) => s.state === 'current')
        expect(current, `${kind}/${status}`).toHaveLength(1)
      }
    }
  })
})

describe('customerStatusHint', () => {
  it('tells a COD buyer to expect a call, not a transfer', () => {
    const hint = customerStatusHint('pending_payment', 'cod')
    expect(hint).toMatch(/call/i)
    expect(hint).not.toMatch(/transfer|slip/i)
  })

  it('gives a COD buyer a window for the confirmation call, not an open wait', () => {
    expect(customerStatusHint('pending_payment', 'cod')).toMatch(/within 3 hours/i)
  })

  it('tells a wallet buyer to transfer and warns about the 24h expiry', () => {
    const hint = customerStatusHint('pending_payment', 'wallet')
    expect(hint).toMatch(/slip/i)
    expect(hint).toMatch(/24 hours/i)
  })

  it('gives a wallet buyer the exact deadline, and says a slip stops the clock', () => {
    expect(customerStatusHint('pending_payment', 'wallet', '24 Oct 2026, 20:52')).toBe(
      'Transfer the total, then upload your payment slip by 24 Oct 2026, 20:52 Myanmar time. Once the slip is uploaded, the order is not cancelled while we check it.',
    )
  })

  it('tells a buyer with a slip in review that the order will not lapse', () => {
    expect(customerStatusHint('payment_submitted', 'wallet')).toBe(
      'We are checking your slip against our bank records. The order is not cancelled while we check it.',
    )
  })

  it('does not call a confirmed order on its way before it has left', () => {
    expect(customerStatusHint('confirmed', 'wallet')).toBe(
      'Payment confirmed. We pack it the next working day. For tracking once it has left, message us on Telegram.',
    )
    expect(customerStatusHint('confirmed', 'cod')).toBe(
      'Confirmed. We pack it the next working day. Have the exact amount ready for the courier.',
    )
    for (const kind of KINDS) {
      expect(customerStatusHint('confirmed', kind)).not.toMatch(/on (its|the) way/i)
    }
  })

  it('goes quiet on terminal statuses - nothing is expected of anyone', () => {
    for (const kind of KINDS) {
      expect(customerStatusHint('delivered', kind)).toBeNull()
      expect(customerStatusHint('cancelled', kind)).toBeNull()
    }
  })

  it('covers every live status', () => {
    for (const kind of KINDS) {
      for (const status of ['pending_payment', 'payment_submitted', 'confirmed'] as const) {
        expect(customerStatusHint(status, kind), `${kind}/${status}`).toBeTruthy()
      }
    }
  })
})

describe('paymentNote', () => {
  it('acknowledges the money once a wallet order is confirmed', () => {
    expect(paymentNote('confirmed', 'wallet', 83_000)).toBe(
      'Payment received: Ks 83,000, checked by our team.',
    )
    expect(paymentNote('delivered', 'wallet', 650_000)).toBe(
      'Payment received: Ks 650,000, checked by our team.',
    )
  })

  it('does not claim the money arrived before the shop has checked it', () => {
    for (const status of ['pending_payment', 'payment_submitted'] as const) {
      expect(paymentNote(status, 'wallet', 83_000)).toBe(
        'Bank transfer or mobile wallet, checked by our team.',
      )
    }
  })

  it('says nothing about money on a cancelled wallet order', () => {
    expect(paymentNote('cancelled', 'wallet', 83_000)).toBe('Bank transfer or mobile wallet.')
  })

  it('keeps cash on delivery as it was, whatever the status', () => {
    for (const status of ORDER_STATUSES) {
      expect(paymentNote(status, 'cod', 83_000)).toBe('Pay the courier when the parcel arrives.')
    }
  })
})

describe('listStatusLabel', () => {
  it('drops "pay on delivery" where the payment method already says cash on delivery', () => {
    expect(listStatusLabel('confirmed', 'cod')).toBe('Confirmed')
  })

  it('otherwise reads like the order page', () => {
    for (const kind of KINDS) {
      for (const status of ORDER_STATUSES) {
        if (status === 'confirmed' && kind === 'cod') continue
        expect(listStatusLabel(status, kind), `${kind}/${status}`).toBe(customerStatusLabel(status, kind))
      }
    }
  })
})

describe('owesPayment', () => {
  it('is true only for a wallet order still waiting for its transfer', () => {
    expect(owesPayment('pending_payment', 'wallet')).toBe(true)
    expect(owesPayment('pending_payment', 'cod')).toBe(false)
    expect(owesPayment('payment_submitted', 'wallet')).toBe(false)
  })
})

describe('OPEN_ORDER_STATUSES', () => {
  it('is every status except delivered and cancelled', () => {
    expect([...OPEN_ORDER_STATUSES]).toEqual(ORDER_STATUSES.filter((s) => s !== 'delivered' && s !== 'cancelled'))
  })
})
