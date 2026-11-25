import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '@/lib/auth-tokens'
import { resetBuckets } from '@/lib/rate-limit'
import { products } from '@/db/schema/products'

const TOKEN = 'd'.repeat(64)

/** Current prices, as the database would answer a read. */
let current: { id: string; priceMmk: number; salePriceMmk: number | null }[] = []
/** `affectedRows` per update, in order. Defaults to 1. */
let updateAffects: number[] = []
let reads = 0
let transactions = 0
const sets: unknown[] = []
const updateWheres: unknown[] = []

const { revalidateTag, sendTelegram } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  sendTelegram: vi.fn<(text: string) => Promise<void>>(async () => {}),
}))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))

// Conditions reduced to plain records so a test can read each write's guard.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...conds: unknown[]) => ({ and: conds }),
  eq: (col: unknown, value: unknown) => ({ eq: [col, value] }),
  isNull: (col: unknown) => ({ isNull: col }),
  inArray: (col: unknown, values: unknown) => ({ inArray: [col, values] }),
}))

vi.mock('@/db', () => {
  const select = {
    from: () => select,
    where: () => {
      reads += 1
      return Promise.resolve(current)
    },
  }
  const tx = {
    update: () => {
      const u = {
        set: (patch: unknown) => {
          sets.push(patch)
          return u
        },
        // mysql2 hands back [ResultSetHeader, FieldPacket[]].
        where: async (cond: unknown) => {
          updateWheres.push(cond)
          return [{ affectedRows: updateAffects.shift() ?? 1 }, []]
        },
      }
      return u
    },
  }
  return {
    db: {
      select: () => select,
      transaction: async (cb: (t: typeof tx) => Promise<unknown>) => {
        transactions += 1
        return cb(tx)
      },
    },
  }
})

const { PATCH } = await import('./route')

let ip = 0
function patch(body: unknown, token: string | null = TOKEN): Request {
  ip += 1
  return new Request('https://techx-store.online/api/v1/ops/prices', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.60.0.${ip}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

const WREN = { id: 'wren-65', priceWas: 120_000, salePriceWas: 90_000, priceMmk: 130_000, salePriceMmk: 97_000 }
const ALBA = { id: 'alba-40', priceWas: 250_000, salePriceWas: null, priceMmk: 270_000, salePriceMmk: null }

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { code: string; message: string; details?: unknown } }).error
}

beforeEach(() => {
  resetBuckets()
  vi.stubEnv('OPS_TOKEN_SHA256', hashToken(TOKEN))
  current = [
    { id: 'alba-40', priceMmk: 250_000, salePriceMmk: null },
    { id: 'wren-65', priceMmk: 120_000, salePriceMmk: 90_000 },
  ]
  updateAffects = []
  reads = 0
  transactions = 0
  sets.length = 0
  updateWheres.length = 0
  revalidateTag.mockClear()
  sendTelegram.mockReset()
  sendTelegram.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('PATCH /api/v1/ops/prices', () => {
  it('refuses a request without the token, before reading anything', async () => {
    expect((await PATCH(patch({ dryRun: true, changes: [ALBA] }, null))).status).toBe(401)
    expect(reads).toBe(0)
  })

  it.each([
    ['no changes', { dryRun: false, changes: [] }],
    ['more than 500 changes', { dryRun: false, changes: Array.from({ length: 501 }, (_, i) => ({ ...ALBA, id: `p-${i}` })) }],
    ['the same product twice', { dryRun: false, changes: [ALBA, ALBA] }],
    ['a malformed id', { dryRun: false, changes: [{ ...ALBA, id: '../admin' }] }],
    ['no dryRun flag', { changes: [ALBA] }],
    ['a price of 0', { dryRun: false, changes: [{ ...ALBA, priceMmk: 0 }] }],
    ['a sale not below the price', { dryRun: false, changes: [{ ...ALBA, salePriceMmk: 270_000 }] }],
    ['a new sale of 0', { dryRun: false, changes: [{ ...ALBA, salePriceMmk: 0 }] }],
    ['a price above the maximum', { dryRun: false, changes: [{ ...ALBA, priceMmk: 1_000_000_000 }] }],
    ['an old price above the maximum', { dryRun: false, changes: [{ ...ALBA, priceWas: 1e15 }] }],
  ])('refuses %s with 400, writing nothing', async (_label, body) => {
    expect((await PATCH(patch(body))).status).toBe(400)
    expect(transactions).toBe(0)
  })

  it('answers 404 naming a product that does not exist', async () => {
    current = [current[0]!]
    const res = await PATCH(patch({ dryRun: true, changes: [ALBA, WREN] }))
    expect(res.status).toBe(404)
    expect((await errorOf(res)).message).toContain('wren-65')
  })

  describe('dry run', () => {
    it('confirms the plan still holds, and writes nothing', async () => {
      const res = await PATCH(patch({ dryRun: true, changes: [WREN, ALBA] }))
      expect(res.status).toBe(200)
      expect(((await res.json()) as { data: unknown }).data).toMatchObject({ applied: false, count: 2 })
      expect(transactions).toBe(0)
      expect(revalidateTag).not.toHaveBeenCalled()
      expect(sendTelegram).not.toHaveBeenCalled()
    })

    it('answers 409 with the current prices when they moved since the preview', async () => {
      current = [{ ...current[0]!, priceMmk: 255_000 }, current[1]!]
      const res = await PATCH(patch({ dryRun: true, changes: [ALBA, WREN] }))
      expect(res.status).toBe(409)
      const err = await errorOf(res)
      expect(err.code).toBe('STALE')
      expect(err.details).toEqual({ current: [{ id: 'alba-40', priceMmk: 255_000, salePriceMmk: null }] })
    })
  })

  describe('apply', () => {
    it('writes each price only over the one the preview saw, in product-id order', async () => {
      const res = await PATCH(patch({ dryRun: false, changes: [WREN, ALBA] }))

      expect(res.status).toBe(200)
      expect(((await res.json()) as { data: unknown }).data).toEqual({ applied: true, count: 2 })
      expect(sets).toEqual([
        { priceMmk: 270_000, salePriceMmk: null },
        { priceMmk: 130_000, salePriceMmk: 97_000 },
      ])
      expect(updateWheres).toEqual([
        { and: [{ eq: [products.id, 'alba-40'] }, { eq: [products.priceMmk, 250_000] }, { isNull: products.salePriceMmk }] },
        { and: [{ eq: [products.id, 'wren-65'] }, { eq: [products.priceMmk, 120_000] }, { eq: [products.salePriceMmk, 90_000] }] },
      ])
    })

    it('keeps the current sale when the change leaves it out', async () => {
      const priceOnly = { id: WREN.id, priceWas: WREN.priceWas, salePriceWas: WREN.salePriceWas, priceMmk: 125_000 }
      await PATCH(patch({ dryRun: false, changes: [priceOnly] }))
      expect(sets).toEqual([{ priceMmk: 125_000, salePriceMmk: 90_000 }])
    })

    it('refreshes the catalog and tells the owner, once', async () => {
      await PATCH(patch({ dryRun: false, changes: [WREN, ALBA] }))
      expect(revalidateTag).toHaveBeenCalledWith('products')
      expect(sendTelegram).toHaveBeenCalledOnce()
      expect(sendTelegram.mock.calls[0]?.[0]).toContain('wren-65: Ks 120,000 -> Ks 130,000')
    })

    it('rolls everything back when a price moved during the write', async () => {
      // An order or another edit changed wren-65 between the read and the write.
      updateAffects = [1, 0]
      const res = await PATCH(patch({ dryRun: false, changes: [WREN, ALBA] }))
      expect(res.status).toBe(409)
      expect((await errorOf(res)).code).toBe('STALE')
      expect(revalidateTag).not.toHaveBeenCalled()
      expect(sendTelegram).not.toHaveBeenCalled()
    })

    it('fails a repeated apply, because the old prices are gone', async () => {
      current = [
        { id: 'alba-40', priceMmk: 270_000, salePriceMmk: null },
        { id: 'wren-65', priceMmk: 130_000, salePriceMmk: 97_000 },
      ]
      expect((await PATCH(patch({ dryRun: false, changes: [WREN, ALBA] }))).status).toBe(409)
      expect(transactions).toBe(0)
    })

    it('still answers 200 when Telegram fails', async () => {
      sendTelegram.mockRejectedValueOnce(new Error('telegram down'))
      expect((await PATCH(patch({ dryRun: false, changes: [ALBA] }))).status).toBe(200)
    })
  })
})

describe('PATCH /api/v1/ops/prices limits and timing', () => {
  it('refuses an oversized body before reading it', async () => {
    const res = await PATCH(
      new Request('https://techx-store.online/api/v1/ops/prices', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'content-length': String(300_000),
          'x-forwarded-for': '10.60.9.1',
          authorization: `Bearer ${TOKEN}`,
        },
        body: '{}',
      }),
    )
    expect(res.status).toBe(413)
    expect(reads).toBe(0)
  })

  it('answers without waiting for Telegram, so a slow Telegram cannot time the owner out after the write', async () => {
    sendTelegram.mockImplementationOnce(() => new Promise(() => {}))
    const res = await PATCH(patch({ dryRun: false, changes: [ALBA] }))
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/v1/ops/prices audit log', () => {
  let info: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    info = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    info.mockRestore()
  })

  it('logs every applied change, with the caller, in one line', async () => {
    await PATCH(patch({ dryRun: false, changes: [WREN, ALBA] }))
    expect(info).toHaveBeenCalledOnce()
    const [label, entry] = info.mock.calls[0] as [string, { ip: string; count: number; changes: string }]
    expect(label).toBe('[ops] prices applied')
    expect(entry.ip).toMatch(/^10\.60\.0\.\d+$/)
    expect(entry.count).toBe(2)
    expect(entry.changes).toBe('alba-40 250000->270000; wren-65 120000->130000 sale 90000->97000')
    expect(JSON.stringify(info.mock.calls)).not.toContain(TOKEN)
  })

  it('logs every row, not the first ten as Telegram does', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `p-${String(i).padStart(2, '0')}`, priceMmk: 1000, salePriceMmk: null }))
    current = many
    await PATCH(patch({ dryRun: false, changes: many.map((r) => ({ id: r.id, priceWas: 1000, salePriceWas: null, priceMmk: 2000 })) }))
    expect((info.mock.calls[0]?.[1] as { changes: string }).changes.split('; ')).toHaveLength(12)
  })

  it('keeps every row of the largest batch, in lines short enough that the log never cuts them', async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `product-${String(i).padStart(3, '0')}`)
    current = ids.map((id) => ({ id, priceMmk: 999_000_000, salePriceMmk: 998_000_000 }))
    const changes = ids.map((id) => ({ id, priceWas: 999_000_000, salePriceWas: 998_000_000, priceMmk: 999_999_999, salePriceMmk: 1 }))
    await PATCH(patch({ dryRun: false, changes }))
    const lines = info.mock.calls.map((c: unknown[]) => c[1] as { part: string; changes: string })
    const rows = lines.flatMap((l: { changes: string }) => l.changes.split('; '))
    expect(rows.map((r: string) => r.split(' ')[0])).toEqual(ids)
    for (const l of lines) expect(l.changes.length).toBeLessThan(10_000)
    expect(lines.at(-1)?.part).toBe(`${lines.length}/${lines.length}`)
  })

    it('logs nothing for a dry run or a refused write', async () => {
    await PATCH(patch({ dryRun: true, changes: [ALBA] }))
    updateAffects = [0]
    await PATCH(patch({ dryRun: false, changes: [ALBA] }))
    expect(info).not.toHaveBeenCalled()
  })
})
