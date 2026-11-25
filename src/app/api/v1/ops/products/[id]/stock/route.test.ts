import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '@/lib/auth-tokens'
import { resetBuckets } from '@/lib/rate-limit'

const TOKEN = 'e'.repeat(64)

/** Stock reads, in order: the check before writing, then the read-back after a refused write. */
let reads: { stockQty: number }[][] = []
let restocked = true
let transactions = 0

const { revalidateTag, sendTelegram, restock } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  sendTelegram: vi.fn<(text: string) => Promise<void>>(async () => {}),
  restock: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))
vi.mock('@/lib/stock', () => ({ restock }))

vi.mock('@/db', () => {
  const select = {
    from: () => select,
    where: () => select,
    limit: () => Promise.resolve(reads.shift() ?? []),
  }
  return {
    db: {
      select: () => select,
      transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
        transactions += 1
        return cb('tx')
      },
    },
  }
})

const { POST } = await import('./route')

let ip = 0
function post(id: string, body: unknown, token: string | null = TOKEN) {
  ip += 1
  const req = new Request(`https://techx-store.online/api/v1/ops/products/${id}/stock`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.70.0.${ip}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return POST(req, { params: Promise.resolve({ id }) })
}

async function body(res: Response) {
  return (await res.json()) as { data?: unknown; error?: { code: string; message: string; details?: unknown } }
}

const DELIVERY = { dryRun: false, add: 20, stockWas: 4 }

beforeEach(() => {
  resetBuckets()
  vi.stubEnv('OPS_TOKEN_SHA256', hashToken(TOKEN))
  reads = [[{ stockQty: 4 }]]
  restocked = true
  transactions = 0
  restock.mockReset()
  restock.mockImplementation(async () => restocked)
  revalidateTag.mockClear()
  sendTelegram.mockReset()
  sendTelegram.mockResolvedValue(undefined)
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/v1/ops/products/[id]/stock', () => {
  it('refuses a request without the token, before reading anything', async () => {
    expect((await post('kestrel-75', DELIVERY, null)).status).toBe(401)
    expect(reads).toHaveLength(1)
  })

  it.each([
    ['a malformed id', '../admin', DELIVERY],
    ['adding nothing', 'kestrel-75', { ...DELIVERY, add: 0 }],
    ['adding more than 10,000', 'kestrel-75', { ...DELIVERY, add: 10_001 }],
    ['a fractional amount', 'kestrel-75', { ...DELIVERY, add: 1.5 }],
    ['a negative old stock', 'kestrel-75', { ...DELIVERY, stockWas: -1 }],
    ['no dryRun flag', 'kestrel-75', { add: 20, stockWas: 4 }],
    ['a total above 100,000', 'kestrel-75', { ...DELIVERY, add: 10_000, stockWas: 95_000 }],
  ])('refuses %s with 400, writing nothing', async (_label, id, b) => {
    expect((await post(id, b)).status).toBe(400)
    expect(transactions).toBe(0)
  })

  it('answers 404 for a product that does not exist', async () => {
    reads = [[]]
    expect((await post('nope', DELIVERY)).status).toBe(404)
  })

  it('answers 409 with the current stock when it moved since the preview, writing nothing', async () => {
    reads = [[{ stockQty: 3 }]]
    const res = await post('kestrel-75', DELIVERY)
    expect(res.status).toBe(409)
    expect((await body(res)).error).toMatchObject({ code: 'STALE', details: { stockQty: 3 } })
    expect(transactions).toBe(0)
  })

  it('previews the new stock on a dry run, and writes nothing', async () => {
    const res = await post('kestrel-75', { ...DELIVERY, dryRun: true })
    expect(res.status).toBe(200)
    expect((await body(res)).data).toEqual({ applied: false, stockQty: 24 })
    expect(transactions).toBe(0)
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('adds the delivery over the stock the preview saw, then refreshes, logs and tells the owner', async () => {
    const res = await post('kestrel-75', DELIVERY)
    expect(res.status).toBe(200)
    expect((await body(res)).data).toEqual({ applied: true, stockQty: 24 })
    expect(restock).toHaveBeenCalledWith('tx', 'kestrel-75', 20, 4)
    expect(revalidateTag).toHaveBeenCalledWith('products')
    expect(sendTelegram.mock.calls[0]?.[0]).toContain('kestrel-75: stock 4 -> 24 (+20)')
    expect(console.info).toHaveBeenCalledWith('[ops] stock added', expect.objectContaining({ id: 'kestrel-75', was: 4, add: 20, now: 24 }))
  })

  it('answers 409 when an order took stock between the check and the write', async () => {
    restocked = false
    reads = [[{ stockQty: 4 }], [{ stockQty: 3 }]]
    const res = await post('kestrel-75', DELIVERY)
    expect(res.status).toBe(409)
    expect((await body(res)).error?.details).toEqual({ stockQty: 3 })
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('answers 404 when the product was deleted between the check and the write', async () => {
    restocked = false
    reads = [[{ stockQty: 4 }], []]
    expect((await post('kestrel-75', DELIVERY)).status).toBe(404)
  })

  it('still answers 200 when Telegram fails', async () => {
    sendTelegram.mockRejectedValueOnce(new Error('telegram down'))
    expect((await post('kestrel-75', DELIVERY)).status).toBe(200)
  })
})
