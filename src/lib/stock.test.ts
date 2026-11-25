import { beforeEach, describe, expect, it, vi } from 'vitest'
import { orderItems } from '@/db/schema/orders'
import { products } from '@/db/schema/products'

const { sendMail, sendTelegram } = vi.hoisted(() => ({
  sendMail: vi.fn<(p: { to: string; subject: string }) => Promise<{ delivered: boolean }>>(),
  sendTelegram: vi.fn<(text: string) => Promise<boolean>>(async () => true),
}))

vi.mock('@/lib/mail', () => ({ sendMail }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))
vi.mock('@emails/low-stock-alert', () => ({ LowStockAlert: () => null }))

// Conditions and SQL fragments are reduced to plain records so a test can read them.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...conds: unknown[]) => ({ and: conds }),
  eq: (col: unknown, value: unknown) => ({ eq: [col, value] }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: strings.join('?'), values }),
}))

const { OutOfStockError, orderStockLines, restock, returnStock, sendLowStockAlerts, takeStock } = await import(
  './stock'
)

interface Write {
  set: unknown
  where: unknown
}

/** A transaction double: every write is recorded, reads come off a queue. */
function fakeTx(opts: { affects?: number[]; reads?: unknown[][] } = {}) {
  const affects = [...(opts.affects ?? [])]
  const reads = [...(opts.reads ?? [])]
  const writes: Write[] = []
  const readWheres: unknown[] = []
  const tx = {
    update: () => ({
      set: (set: unknown) => ({
        // mysql2 hands back [ResultSetHeader, FieldPacket[]].
        where: async (where: unknown) => {
          writes.push({ set, where })
          return [{ affectedRows: affects.shift() ?? 1 }, []]
        },
      }),
    }),
    select: () => {
      const q = {
        from: () => q,
        where: (cond: unknown) => {
          readWheres.push(cond)
          return q
        },
        limit: () => q,
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(reads.shift() ?? []).then(resolve),
      }
      return q
    },
  }
  return { tx: tx as never, writes, readWheres }
}

const STOCKED = { name: 'Kestrel 75', stockQty: 20, threshold: 3 }

beforeEach(() => {
  sendMail.mockReset()
  sendMail.mockResolvedValue({ delivered: true })
})

describe('takeStock', () => {
  it('takes stock in product-id order and leaves the caller its lines as given', async () => {
    // One lock order everywhere is what keeps two transactions touching the
    // same products from deadlocking.
    const lines = [
      { productId: 'wren-65', qty: 1 },
      { productId: 'kestrel-75', qty: 2 },
    ]
    const { tx, writes } = fakeTx({ reads: [[STOCKED], [STOCKED]] })

    await takeStock(tx, lines)

    expect(writes.map((w) => w.where)).toEqual([
      { and: [{ eq: [products.id, 'kestrel-75'] }, { sql: '? >= ?', values: [products.stockQty, 2] }] },
      { and: [{ eq: [products.id, 'wren-65'] }, { sql: '? >= ?', values: [products.stockQty, 1] }] },
    ])
    expect(writes[0]?.set).toEqual({ stockQty: { sql: '? - ?', values: [products.stockQty, 2] } })
    expect(lines.map((l) => l.productId)).toEqual(['wren-65', 'kestrel-75'])
  })

  it('throws for the first line the shop cannot fill and takes nothing after it', async () => {
    const { tx, writes } = fakeTx({ affects: [0] })
    const lines = [
      { productId: 'kestrel-75', qty: 9 },
      { productId: 'wren-65', qty: 1 },
    ]

    const err = await takeStock(tx, lines).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(OutOfStockError)
    expect((err as InstanceType<typeof OutOfStockError>).productId).toBe('kestrel-75')
    expect(writes).toHaveLength(1)
  })

  it('reports each product left at or below its low-stock threshold', async () => {
    const { tx } = fakeTx({
      reads: [
        [{ name: 'Kestrel 75', stockQty: 3, threshold: 3 }],
        [{ name: 'Wren 65', stockQty: 4, threshold: 3 }],
      ],
    })
    const low = await takeStock(tx, [
      { productId: 'kestrel-75', qty: 1 },
      { productId: 'wren-65', qty: 1 },
    ])
    expect(low).toEqual([{ id: 'kestrel-75', remaining: 3, name: 'Kestrel 75' }])
  })

  it('falls back to a threshold of 3 when the product has none', async () => {
    const { tx } = fakeTx({ reads: [[{ name: 'Kestrel 75', stockQty: 2, threshold: null }]] })
    const low = await takeStock(tx, [{ productId: 'kestrel-75', qty: 1 }])
    expect(low).toEqual([{ id: 'kestrel-75', remaining: 2, name: 'Kestrel 75' }])
  })
})

describe('returnStock', () => {
  it('puts stock back in product-id order, whether or not the product is still listed', async () => {
    // A product retired since the order was placed still has its units on the
    // shelf, so the guard is the id alone.
    const { tx, writes } = fakeTx()
    await returnStock(tx, [
      { productId: 'wren-65', qty: 1 },
      { productId: 'kestrel-75', qty: 2 },
    ])
    expect(writes).toEqual([
      { set: { stockQty: { sql: '? + ?', values: [products.stockQty, 2] } }, where: { eq: [products.id, 'kestrel-75'] } },
      { set: { stockQty: { sql: '? + ?', values: [products.stockQty, 1] } }, where: { eq: [products.id, 'wren-65'] } },
    ])
  })
})

describe('restock', () => {
  it('adds a delivery only over the stock the owner saw', async () => {
    const { tx, writes } = fakeTx()
    expect(await restock(tx, 'kestrel-75', 20, 4)).toBe(true)
    expect(writes).toEqual([
      {
        set: { stockQty: { sql: '? + ?', values: [products.stockQty, 20] } },
        where: { and: [{ eq: [products.id, 'kestrel-75'] }, { eq: [products.stockQty, 4] }] },
      },
    ])
  })

  it('reports that nothing was added when the stock moved meanwhile', async () => {
    const { tx } = fakeTx({ affects: [0] })
    expect(await restock(tx, 'kestrel-75', 20, 4)).toBe(false)
  })
})

describe('orderStockLines', () => {
  it("reads the order's lines", async () => {
    const { tx, readWheres } = fakeTx({ reads: [[{ productId: 'kestrel-75', qty: 2 }]] })
    expect(await orderStockLines(tx, 'order-1')).toEqual([{ productId: 'kestrel-75', qty: 2 }])
    expect(readWheres).toEqual([{ eq: [orderItems.orderId, 'order-1'] }])
  })
})

describe('sendLowStockAlerts', () => {
  it('tells the owner which products are low and which are gone', async () => {
    vi.stubEnv('EMAIL_FROM', 'TechX <owner@example.com>')
    await sendLowStockAlerts([
      { id: 'kestrel-75', remaining: 2, name: 'Kestrel 75' },
      { id: 'wren-65', remaining: 0, name: 'Wren 65' },
    ])
    expect(sendMail.mock.calls.map(([p]) => [p.to, p.subject])).toEqual([
      ['owner@example.com', 'Low stock: Kestrel 75'],
      ['owner@example.com', 'Sold out: Wren 65'],
    ])
    vi.unstubAllEnvs()
  })

  it('keeps going when one alert fails to send', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    await expect(
      sendLowStockAlerts([
        { id: 'a', remaining: 1, name: 'A' },
        { id: 'b', remaining: 1, name: 'B' },
      ]),
    ).resolves.toBeUndefined()
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(sendTelegram).toHaveBeenCalledWith(expect.stringContaining('Email not sent: low-stock alert: A'))
  })
})
