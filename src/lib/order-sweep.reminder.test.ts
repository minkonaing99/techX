import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { orders } from '@/db/schema/orders'
import { paymentMethods } from '@/db/schema/payment-methods'

/*
 * remindUnpaidOrders, apart from order-sweep.test.ts so each file stays a
 * readable size. Only the reminder's own read and claim are mocked here.
 */

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-10-21T12:00:00.000Z')

let unpaid: { id: string; email: string; totalMmk: number; expiresAt: Date; method: string }[] = []
const reads: unknown[] = []
const sets: unknown[] = []
const updateWheres: unknown[] = []
/** `affectedRows` per update, in order; defaults to 1. */
let affects: number[] = []
/** Updates that throw, by position. */
let throws: boolean[] = []
let templateThrows = false

const { sendMail, sendTelegram, reportError } = vi.hoisted(() => ({
  sendMail: vi.fn<(p: { to: string; subject: string }) => Promise<{ delivered: boolean }>>(),
  sendTelegram: vi.fn<(text: string) => Promise<boolean>>(async () => true),
  reportError: vi.fn<(err: unknown, ctx?: { path?: string }) => Promise<void>>(),
}))

vi.mock('@/lib/mail', () => ({ sendMail }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))
vi.mock('@/lib/report-error', () => ({ reportError }))
vi.mock('next/cache', () => ({ revalidateTag: () => {} }))
vi.mock('@emails/order-cancelled', () => ({ OrderCancelled: () => null }))
vi.mock('@emails/payment-reminder', () => ({
  PaymentReminder: () => {
    if (templateThrows) throw new Error('template broke')
    return null
  },
}))
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...conds: unknown[]) => ({ and: conds }),
  eq: (col: unknown, value: unknown) => ({ eq: [col, value] }),
  lt: (col: unknown, value: unknown) => ({ lt: [col, value] }),
  gt: (col: unknown, value: unknown) => ({ gt: [col, value] }),
  lte: (col: unknown, value: unknown) => ({ lte: [col, value] }),
  isNull: (col: unknown) => ({ isNull: col }),
}))
vi.mock('@/db', () => {
  const select = {
    from: () => select,
    innerJoin: () => select,
    where: (cond: unknown) => {
      reads.push(cond)
      return Promise.resolve(unpaid)
    },
  }
  const update = () => {
    const u = {
      set: (patch: unknown) => {
        sets.push(patch)
        return u
      },
      where: (cond: unknown) => {
        updateWheres.push(cond)
        if (throws.shift()) return Promise.reject(new Error('lock wait timeout'))
        return Promise.resolve([{ affectedRows: affects.shift() ?? 1 }, []])
      },
    }
    return u
  }
  return { db: { select: () => select, update } }
})

const { remindUnpaidOrders } = await import('./order-sweep')

const UNPAID = {
  id: '3aa6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  email: 'wallet@example.com',
  totalMmk: 548_000,
  expiresAt: new Date(NOW.getTime() + 5 * HOUR),
  method: 'KBZ Pay',
}

const CLAIM = {
  and: [
    { eq: [orders.id, UNPAID.id] },
    { eq: [orders.status, 'pending_payment'] },
    { isNull: orders.paymentReminderSentAt },
    // A slip sent back mid-sweep moves the deadline: no reminder with a stale one.
    { eq: [orders.expiresAt, UNPAID.expiresAt] },
    // And the deadline must still be ahead when this order's turn comes.
    { gt: [orders.expiresAt, expect.any(Date)] },
  ],
}
const RELEASE = { and: [{ eq: [orders.id, UNPAID.id] }, { eq: [orders.paymentReminderSentAt, NOW] }] }

beforeEach(() => {
  unpaid = []
  reads.length = 0
  sets.length = 0
  updateWheres.length = 0
  affects = []
  throws = []
  templateThrows = false
  sendMail.mockReset()
  sendMail.mockResolvedValue({ delivered: true })
  sendTelegram.mockClear()
  reportError.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('remindUnpaidOrders', () => {
  it('asks for unpaid wallet orders, not yet reminded, due within six hours', async () => {
    await remindUnpaidOrders(NOW)
    expect(reads).toEqual([
      {
        and: [
          { eq: [orders.status, 'pending_payment'] },
          { eq: [paymentMethods.kind, 'wallet'] },
          { isNull: orders.paymentReminderSentAt },
          { gt: [orders.expiresAt, NOW] },
          { lte: [orders.expiresAt, new Date(NOW.getTime() + 6 * HOUR)] },
        ],
      },
    ])
  })

  it('claims the reminder before sending, so a deadline gets one at most', async () => {
    unpaid = [UNPAID]
    expect(await remindUnpaidOrders(NOW)).toBe(1)
    expect(sets).toEqual([{ paymentReminderSentAt: NOW }])
    expect(updateWheres).toEqual([CLAIM])
    expect(sendMail).toHaveBeenCalledOnce()
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: 'wallet@example.com', subject: expect.stringContaining('payment reminder') })
  })

  it('sends nothing when something else claimed or moved the order first', async () => {
    unpaid = [UNPAID]
    affects = [0]
    expect(await remindUnpaidOrders(NOW)).toBe(0)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('releases the claim when the email does not go out, so the next sweep tries again', async () => {
    unpaid = [UNPAID]
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    expect(await remindUnpaidOrders(NOW)).toBe(0)
    expect(sets).toEqual([{ paymentReminderSentAt: NOW }, { paymentReminderSentAt: null }])
    expect(updateWheres).toEqual([CLAIM, RELEASE])
  })

  it('claims and releases with a whole-second time, which is all the column keeps', async () => {
    // The column is a plain TIMESTAMP: MariaDB drops the milliseconds when it
    // stores the claim, so a release matching on .123 would find nothing.
    const at = new Date('2026-10-21T12:00:00.123Z')
    const whole = new Date('2026-10-21T12:00:00.000Z')
    unpaid = [{ ...UNPAID, expiresAt: new Date(at.getTime() + 5 * HOUR) }]
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    await remindUnpaidOrders(at)
    expect(sets[0]).toEqual({ paymentReminderSentAt: whole })
    expect(updateWheres[1]).toEqual({
      and: [{ eq: [orders.id, UNPAID.id] }, { eq: [orders.paymentReminderSentAt, whole] }],
    })
  })

  it('releases the claim and reports when the email cannot be built', async () => {
    unpaid = [UNPAID]
    templateThrows = true
    expect(await remindUnpaidOrders(NOW)).toBe(0)
    expect(updateWheres).toEqual([CLAIM, RELEASE])
    expect(reportError).toHaveBeenCalledOnce()
  })

  it('skips an order whose deadline passed while earlier emails were sending', async () => {
    vi.useFakeTimers({ now: NOW })
    const soon = { ...UNPAID, id: '9bb6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b', expiresAt: new Date(NOW.getTime() + 60_000) }
    unpaid = [UNPAID, soon]
    // The first send takes two minutes: the second order is past its deadline by its turn.
    sendMail.mockImplementationOnce(async () => {
      vi.setSystemTime(NOW.getTime() + 120_000)
      return { delivered: true }
    })
    await remindUnpaidOrders(NOW)
    const secondClaim = (updateWheres[1] as { and: { gt?: [unknown, Date] }[] }).and.find((c) => c.gt)!
    expect(secondClaim.gt![1].getTime()).toBeGreaterThan(soon.expiresAt.getTime())
  })

  it('keeps going when one order fails, and reports once', async () => {
    unpaid = [UNPAID, { ...UNPAID, id: '9bb6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b', email: 'b@example.com' }]
    throws = [true]
    expect(await remindUnpaidOrders(NOW)).toBe(1)
    expect(reportError).toHaveBeenCalledOnce()
  })
})
