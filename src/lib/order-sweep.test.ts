import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { orders } from '@/db/schema/orders'

interface Expired {
  id: string
  kind: 'wallet' | 'cod'
  email: string
  stockReserved?: boolean
}

/** Rows the expired-order select returns. */
let expired: Expired[] = []
/** `affectedRows` for each conditional update, in order. Defaults to 1. */
let updateAffects: number[] = []
/** Orders whose update throws, by position. */
let updateThrows: boolean[] = []
let emailThrows = false
/** When set, reading a reserved order's lines fails inside the transaction. */
let lineReadFails = false
let selectFails = false
/** When set, the select waits on this promise, so a sweep can be held in flight. */
let selectGate: Promise<void> | null = null
const selectWheres: unknown[] = []
/** Slips awaiting review, as the reminder's read returns them. */
let staleSlips: { id: string; updatedAt: Date }[] = []
const slipWheres: unknown[] = []
/** Reads routed to the payment reminder (tested in order-sweep.reminder.test.ts). */
const reminderWheres: unknown[] = []
const updateWheres: unknown[] = []
const sets: unknown[] = []

const { sendMail, reportError, sendTelegram } = vi.hoisted(() => ({
  sendTelegram: vi.fn<(text: string, opts?: { html?: boolean }) => Promise<boolean>>(async () => true),
  sendMail: vi.fn<(p: { to: string; subject: string; react: unknown }) => Promise<{ delivered: boolean }>>(),
  reportError: vi.fn<(err: unknown, ctx?: { path?: string }) => Promise<void>>(),
}))

vi.mock('@/lib/mail', () => ({ sendMail }))
vi.mock('@/lib/report-error', () => ({ reportError }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@emails/payment-reminder', () => ({ PaymentReminder: () => null }))
vi.mock('@emails/order-cancelled', () => ({
  OrderCancelled: (props: { reason: string }) => {
    if (emailThrows) throw new Error('template broke')
    return { reason: props.reason }
  },
}))

// Conditions are reduced to plain records so the test can read the query.
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
    where: (cond: { and?: { eq?: unknown[] }[] }) => {
      // The stale-slip reminder's read, told apart by the status it asks for.
      if (cond.and?.[0]?.eq?.[1] === 'payment_submitted') {
        slipWheres.push(cond)
        return Promise.resolve(staleSlips)
      }
      // The payment reminder's read: pending like the expiry read, but wallet only.
      if (cond.and?.[1]?.eq?.[1] === 'wallet') {
        reminderWheres.push(cond)
        return Promise.resolve([])
      }
      selectWheres.push(cond)
      const result = () => (selectFails ? Promise.reject(new Error('db down')) : Promise.resolve(expired))
      return selectGate ? selectGate.then(result) : result()
    },
  }
  // Inside a transaction the sweep reads an order's lines to return its stock.
  const lineRead = {
    from: () => lineRead,
    where: () =>
      lineReadFails
        ? Promise.reject(new Error('lock wait timeout'))
        : Promise.resolve([{ productId: 'kestrel-75', qty: 2 }]),
  }
  const update = () => {
    const u = {
      set: (patch: unknown) => {
        sets.push(patch)
        return u
      },
      // mysql2 hands back [ResultSetHeader, FieldPacket[]].
      where: (cond: unknown) => {
        updateWheres.push(cond)
        if (updateThrows.shift()) return Promise.reject(new Error('lock wait timeout'))
        return Promise.resolve([{ affectedRows: updateAffects.shift() ?? 1 }, []])
      },
    }
    return u
  }
  return {
    db: {
      select: () => select,
      update,
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({ update, select: () => lineRead }),
    },
  }
})

const {
  SWEEP_INTERVAL_MS,
  cancelExpiredOrders,
  remindStaleSlips,
  startOrderSweep,
  stopOrderSweep,
  sweepIsCurrent,
} = await import('./order-sweep')

const NOW = new Date('2026-10-21T12:00:00.000Z')
const WALLET_ORDER: Expired = {
  id: '3aa6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  kind: 'wallet',
  email: 'wallet@example.com',
}
const COD_ORDER: Expired = {
  id: '9bb6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  kind: 'cod',
  email: 'cod@example.com',
}

function mail(i: number) {
  const params = sendMail.mock.calls[i]?.[0]
  return { to: params?.to, subject: params?.subject, reason: (params?.react as { reason?: string })?.reason }
}

beforeEach(() => {
  expired = []
  updateAffects = []
  updateThrows = []
  emailThrows = false
  lineReadFails = false
  selectFails = false
  selectGate = null
  selectWheres.length = 0
  slipWheres.length = 0
  staleSlips = []
  reminderWheres.length = 0
  sendTelegram.mockReset()
  sendTelegram.mockResolvedValue(true)
  updateWheres.length = 0
  sets.length = 0
  sendMail.mockReset()
  sendMail.mockResolvedValue({ delivered: true })
  reportError.mockReset()
})

afterEach(() => {
  stopOrderSweep()
  vi.useRealTimers()
})

describe('cancelExpiredOrders', () => {
  it('asks only for pending orders whose expiry has passed', async () => {
    await cancelExpiredOrders(NOW)
    expect(selectWheres).toEqual([
      {
        and: [{ eq: [orders.status, 'pending_payment'] }, { lt: [orders.expiresAt, NOW] }],
      },
    ])
  })

  it('does nothing when no order has expired', async () => {
    expect(await cancelExpiredOrders(NOW)).toEqual({ cancelled: 0, emailed: 0, failed: 0 })
    expect(sets).toHaveLength(0)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('cancels only an order that is still pending at the moment of the write', async () => {
    expired = [WALLET_ORDER]
    await cancelExpiredOrders(NOW)
    expect(sets).toEqual([{ status: 'cancelled' }])
    expect(updateWheres).toEqual([
      {
        and: [{ eq: [orders.id, WALLET_ORDER.id] }, { eq: [orders.status, 'pending_payment'] }],
      },
    ])
  })

  it('tells a wallet customer the payment never arrived', async () => {
    expired = [WALLET_ORDER]
    expect(await cancelExpiredOrders(NOW)).toEqual({ cancelled: 1, emailed: 1, failed: 0 })
    expect(mail(0)).toEqual({
      to: 'wallet@example.com',
      subject: 'Order 3AA6E85B - cancelled, payment not received',
      reason: 'Payment was not received within 24 hours, so the order was released automatically.',
    })
  })

  it('tells a COD customer the order could not be confirmed', async () => {
    expired = [COD_ORDER]
    await cancelExpiredOrders(NOW)
    expect(mail(0)).toEqual({
      to: 'cod@example.com',
      subject: 'Order 9BB6E85B - cancelled, not confirmed',
      reason: 'We could not confirm your order by phone within 24 hours, so it was released automatically.',
    })
  })

  it('sends no email for an order something else moved first', async () => {
    // The customer cancelled, uploaded a slip, or another sweep got there
    // between the select and this write.
    expired = [WALLET_ORDER, COD_ORDER]
    updateAffects = [0, 1]
    expect(await cancelExpiredOrders(NOW)).toEqual({ cancelled: 1, emailed: 1, failed: 0 })
    expect(sendMail).toHaveBeenCalledOnce()
    expect(mail(0).to).toBe('cod@example.com')
  })

  it('keeps going when one email fails', async () => {
    expired = [WALLET_ORDER, COD_ORDER]
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    expect(await cancelExpiredOrders(NOW)).toEqual({ cancelled: 2, emailed: 1, failed: 0 })
    expect(sendMail).toHaveBeenCalledTimes(2)
    // Counted before, never reported: now the owner hears which order missed its notice.
    expect(sendTelegram).toHaveBeenCalledWith(expect.stringContaining('auto-cancelled (customer)'))
  })

  it('counts an email SMTP dropped as not emailed', async () => {
    expired = [WALLET_ORDER]
    sendMail.mockResolvedValueOnce({ delivered: false })
    expect(await cancelExpiredOrders(NOW)).toEqual({ cancelled: 1, emailed: 0, failed: 0 })
  })
})

describe('startOrderSweep', () => {
  it('sweeps at once, then every interval', async () => {
    vi.useFakeTimers()
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(0)
    expect(selectWheres).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(selectWheres).toHaveLength(2)
    expect(SWEEP_INTERVAL_MS).toBe(60 * 60 * 1000)
  })

  it('ignores a second start', async () => {
    vi.useFakeTimers()
    startOrderSweep()
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(selectWheres).toHaveLength(2)
  })

  it('reports a failed sweep instead of throwing, and tries again next time', async () => {
    vi.useFakeTimers()
    selectFails = true
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(0)
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { path: 'order-sweep' })

    selectFails = false
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(selectWheres).toHaveLength(2)
  })

  it('stops sweeping once stopped', async () => {
    vi.useFakeTimers()
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(0)
    stopOrderSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 3)
    expect(selectWheres).toHaveLength(1)
  })
})

describe('sweepIsCurrent, the heartbeat /api/v1/health reads', () => {
  it('is not current when the sweep was never started - the timer is not running', () => {
    expect(sweepIsCurrent()).toBe(false)
  })

  it('is current right after start, and stays so while sweeps finish', async () => {
    vi.useFakeTimers()
    startOrderSweep()
    expect(sweepIsCurrent()).toBe(true)
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 5)
    expect(sweepIsCurrent()).toBe(true)
  })

  it('goes stale when sweeps keep failing for over two intervals', async () => {
    vi.useFakeTimers()
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(0)
    selectFails = true
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 2)
    expect(sweepIsCurrent()).toBe(true)
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(sweepIsCurrent()).toBe(false)
  })

  it('goes stale when a sweep hangs, which never reaches the error report', async () => {
    vi.useFakeTimers()
    let release!: () => void
    selectGate = new Promise<void>((r) => {
      release = r
    })
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 2)
    expect(sweepIsCurrent()).toBe(true)
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(sweepIsCurrent()).toBe(false)
    // Let the hung sweep finish, so it does not stay "running" into the next test.
    release()
    await vi.advanceTimersByTimeAsync(0)
  })

  it('forgets the last run when stopped, so a restart is judged from the restart', async () => {
    vi.useFakeTimers()
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(0)
    stopOrderSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 5)
    selectFails = true
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 2)
    expect(sweepIsCurrent()).toBe(true)
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(sweepIsCurrent()).toBe(false)
  })

  it('goes stale when every cancellation keeps failing, though each run returns normally', async () => {
    // Held stock is never released, so the outside monitor must see it.
    vi.useFakeTimers()
    expired = [WALLET_ORDER]
    updateThrows = Array.from({ length: 10 }, () => true)
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 3)
    expect(sweepIsCurrent()).toBe(false)
  })

  it('stays current when some cancellations fail but others go through', async () => {
    vi.useFakeTimers()
    expired = [WALLET_ORDER, COD_ORDER]
    updateThrows = Array.from({ length: 10 }, (_, i) => i % 2 === 0)
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 3)
    expect(sweepIsCurrent()).toBe(true)
  })

  it('is not current once stopped', async () => {
    vi.useFakeTimers()
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(0)
    stopOrderSweep()
    expect(sweepIsCurrent()).toBe(false)
  })
})

describe('startOrderSweep while a sweep is still running', () => {
  it('skips a tick instead of starting a second, overlapping sweep', async () => {
    vi.useFakeTimers()
    let release!: () => void
    selectGate = new Promise<void>((r) => {
      release = r
    })
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(selectWheres).toHaveLength(1)

    release()
    selectGate = null
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)
    expect(selectWheres).toHaveLength(2)
  })
})

describe('cancelExpiredOrders when one order fails', () => {
  it('reports that order and carries on with the rest', async () => {
    expired = [WALLET_ORDER, COD_ORDER]
    updateThrows = [true]

    expect(await cancelExpiredOrders(NOW)).toEqual({ cancelled: 1, emailed: 1, failed: 1 })

    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      path: 'order-sweep: 1 of 2 orders failed',
    })
    expect(mail(0).to).toBe('cod@example.com')
  })
})

describe('cancelExpiredOrders reporting', () => {
  it('sends one alert per run however many orders fail', async () => {
    // A lock storm would otherwise post one Telegram message per order, hourly.
    expired = [WALLET_ORDER, COD_ORDER]
    updateThrows = [true, true]
    await cancelExpiredOrders(NOW)
    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      path: 'order-sweep: 2 of 2 orders failed',
    })
  })

  it('counts an order as cancelled even when its email cannot be built', async () => {
    expired = [WALLET_ORDER]
    emailThrows = true
    expect(await cancelExpiredOrders(NOW)).toEqual({ cancelled: 1, emailed: 0, failed: 0 })
    expect(reportError).not.toHaveBeenCalled()
    // Not silently: the owner hears which order missed its notice.
    expect(sendTelegram).toHaveBeenCalledWith(expect.stringContaining('auto-cancelled (customer)\ntemplate broke'))
  })
})

describe('cancelExpiredOrders on orders that reserved stock', () => {
  it('returns the stock after winning the cancel', async () => {
    expired = [{ ...WALLET_ORDER, stockReserved: true }]
    expect(await cancelExpiredOrders(NOW)).toEqual({ cancelled: 1, emailed: 1, failed: 0 })
    expect(sets[0]).toEqual({ status: 'cancelled' })
    expect(sets[1]).toHaveProperty('stockQty')
  })

  it('returns nothing when something else moved the order first', async () => {
    expired = [{ ...WALLET_ORDER, stockReserved: true }]
    updateAffects = [0]
    await cancelExpiredOrders(NOW)
    expect(sets).toEqual([{ status: 'cancelled' }])
  })

  it('never refreshes the catalog cache, which only works inside a request', async () => {
    expired = [{ ...WALLET_ORDER, stockReserved: true }]
    await cancelExpiredOrders(NOW)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('cancelExpiredOrders when returning stock fails', () => {
  it('sends no email for that order, reports it, and carries on', async () => {
    // The transaction rolls the claim back with it, so the customer must not
    // be told the order was cancelled.
    expired = [{ ...WALLET_ORDER, stockReserved: true }, COD_ORDER]
    lineReadFails = true

    expect(await cancelExpiredOrders(NOW)).toEqual({ cancelled: 1, emailed: 1, failed: 1 })

    expect(sendMail).toHaveBeenCalledOnce()
    expect(mail(0).to).toBe('cod@example.com')
    expect(reportError).toHaveBeenCalledOnce()
  })
})

describe('remindStaleSlips', () => {
  const HOUR = 60 * 60 * 1000
  const slip = (id: string, ageHours: number) => ({ id, updatedAt: new Date(NOW.getTime() - ageHours * HOUR) })

  it('asks only for slips that have waited more than a day', async () => {
    await remindStaleSlips(NOW)
    expect(slipWheres).toEqual([
      {
        and: [
          { eq: [orders.status, 'payment_submitted'] },
          { lt: [orders.updatedAt, new Date(NOW.getTime() - 24 * HOUR)] },
        ],
      },
    ])
  })

  it('sends one message for the slips that crossed a whole day this hour', async () => {
    // Hourly sweeps, so each slip is named once a day rather than every hour.
    staleSlips = [
      slip('aaaaaaaa-1111-2222-3333-444444444444', 24.2),
      slip('bbbbbbbb-1111-2222-3333-444444444444', 25.5),
      slip('cccccccc-1111-2222-3333-444444444444', 48.5),
    ]
    await remindStaleSlips(NOW)
    expect(sendTelegram).toHaveBeenCalledOnce()
    const text = sendTelegram.mock.calls[0]?.[0] ?? ''
    expect(text).toContain('AAAAAAAA')
    expect(text).toContain('CCCCCCCC')
    expect(text).not.toContain('BBBBBBBB')
  })

  it('emails the owner the same list when Telegram does not deliver it', async () => {
    // The one owner alert that goes out on Telegram alone: a paid slip waiting.
    staleSlips = [slip('aaaaaaaa-1111-2222-3333-444444444444', 24.2)]
    sendTelegram.mockResolvedValueOnce(false)
    await remindStaleSlips(NOW)
    expect(sendMail).toHaveBeenCalledOnce()
    expect(mail(0).subject).toBe('Slips waiting for review')
    expect(JSON.stringify(sendMail.mock.calls[0]?.[0])).toContain('AAAAAAAA')
  })

  it('sends no email when Telegram delivered the list', async () => {
    staleSlips = [slip('aaaaaaaa-1111-2222-3333-444444444444', 24.2)]
    await remindStaleSlips(NOW)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('stays quiet when no slip crossed a day this hour', async () => {
    staleSlips = [slip('bbbbbbbb-1111-2222-3333-444444444444', 25.5)]
    await remindStaleSlips(NOW)
    expect(sendTelegram).not.toHaveBeenCalled()
  })
})

describe('remindUnpaidOrders', () => {
  it('runs as part of every sweep', async () => {
    vi.useFakeTimers()
    startOrderSweep()
    await vi.advanceTimersByTimeAsync(0)
    expect(reminderWheres).toHaveLength(1)
  })
})
