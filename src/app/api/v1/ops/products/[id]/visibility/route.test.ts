import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '@/lib/auth-tokens'
import { resetBuckets } from '@/lib/rate-limit'
import { products } from '@/db/schema/products'

const TOKEN = 'f'.repeat(64)

interface Row {
  isActive: boolean
  hasPhotos: boolean
  stockQty: number
}

/** Reads, in order: the product, then (when hiding it) its open-order count. */
let reads: unknown[][] = []
let held: Record<string, number> = {}
let updateAffects = 1
const updates: { set: unknown; where: unknown }[] = []

const { revalidateTag, sendTelegram } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  sendTelegram: vi.fn<(text: string) => Promise<void>>(async () => {}),
}))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))
vi.mock('@/lib/held-stock', () => ({ heldByProduct: async () => held }))

vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...conds: unknown[]) => ({ and: conds }),
  eq: (col: unknown, value: unknown) => ({ eq: [col, value] }),
}))

vi.mock('@/db', () => {
  const select = () => {
    const q = {
      from: () => q,
      innerJoin: () => q,
      where: () => q,
      limit: () => q,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(reads.shift() ?? []).then(resolve, reject),
    }
    return q
  }
  const update = () => {
    const u = {
      set: (set: unknown) => ({
        where: async (where: unknown) => {
          updates.push({ set, where })
          return [{ affectedRows: updateAffects }, []]
        },
      }),
    }
    return u
  }
  return { db: { select, update } }
})

const { PATCH } = await import('./route')

let ip = 0
function patch(id: string, b: unknown, token: string | null = TOKEN) {
  ip += 1
  const req = new Request(`https://techx-store.online/api/v1/ops/products/${id}/visibility`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.80.0.${ip}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(b),
  })
  return PATCH(req, { params: Promise.resolve({ id }) })
}

async function body(res: Response) {
  return (await res.json()) as { data?: unknown; error?: { code: string; message: string } }
}

const HIDDEN: Row = { isActive: false, hasPhotos: true, stockQty: 4 }
const LIVE: Row = { isActive: true, hasPhotos: true, stockQty: 4 }

beforeEach(() => {
  resetBuckets()
  vi.stubEnv('OPS_TOKEN_SHA256', hashToken(TOKEN))
  reads = [[HIDDEN]]
  held = {}
  updateAffects = 1
  updates.length = 0
  revalidateTag.mockClear()
  sendTelegram.mockReset()
  sendTelegram.mockResolvedValue(undefined)
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('PATCH /api/v1/ops/products/[id]/visibility', () => {
  it('refuses a request without the token, before reading anything', async () => {
    expect((await patch('kestrel-75', { dryRun: true, active: true }, null)).status).toBe(401)
    expect(reads).toHaveLength(1)
  })

  it.each([
    ['a malformed id', '../admin', { dryRun: true, active: true }],
    ['no active flag', 'kestrel-75', { dryRun: true }],
    ['no dryRun flag', 'kestrel-75', { active: true }],
    ['a force that is not a boolean', 'kestrel-75', { dryRun: true, active: true, force: 'yes' }],
  ])('refuses %s with 400', async (_label, id, b) => {
    expect((await patch(id, b)).status).toBe(400)
    expect(updates).toEqual([])
  })

  it('answers 404 for a product that does not exist', async () => {
    reads = [[]]
    expect((await patch('nope', { dryRun: true, active: true })).status).toBe(404)
  })

  describe('publishing', () => {
    it('refuses a product with no photos unless forced, writing nothing', async () => {
      reads = [[{ ...HIDDEN, hasPhotos: false }]]
      const res = await patch('kestrel-75', { dryRun: false, active: true })
      expect(res.status).toBe(409)
      const error = (await body(res)).error
      expect(error?.code).toBe('NO_PHOTOS')
      // Read by Claude: it must not suggest forcing the publish.
      expect(error?.message).not.toMatch(/force/)
      expect(updates).toEqual([])
    })

    it('publishes a product with no photos when forced, with no photo condition on the write', async () => {
      reads = [[{ ...HIDDEN, hasPhotos: false }]]
      expect((await patch('kestrel-75', { dryRun: false, active: true, force: true })).status).toBe(200)
      expect(updates).toEqual([{ set: { isActive: true }, where: { eq: [products.id, 'kestrel-75'] } }])
    })

    it('refuses when the photos were removed between the check and the write', async () => {
      updateAffects = 0
      reads = [[HIDDEN], [{ ...HIDDEN, hasPhotos: false }]]
      const res = await patch('kestrel-75', { dryRun: false, active: true })
      expect(res.status).toBe(409)
      expect((await body(res)).error?.code).toBe('NO_PHOTOS')
      expect(sendTelegram).not.toHaveBeenCalled()
    })

    it('previews, with the stock and photos the warnings need, and writes nothing', async () => {
      reads = [[{ ...HIDDEN, stockQty: 0 }]]
      const res = await patch('kestrel-75', { dryRun: true, active: true })
      expect((await body(res)).data).toEqual({ applied: false, changed: true, active: true, stockQty: 0, hasPhotos: true })
      expect(updates).toEqual([])
    })

    it('publishes, then refreshes, logs and tells the owner', async () => {
      const res = await patch('kestrel-75', { dryRun: false, active: true })
      expect((await body(res)).data).toMatchObject({ applied: true, changed: true, active: true })
      // The write itself requires photos, so ones removed after the check cannot slip through.
      expect(updates).toEqual([
        {
          set: { isActive: true },
          where: { and: [{ eq: [products.id, 'kestrel-75'] }, { eq: [products.hasPhotos, true] }] },
        },
      ])
      expect(revalidateTag).toHaveBeenCalledWith('products')
      expect(sendTelegram.mock.calls[0]?.[0]).toContain('Published from the Mac: kestrel-75')
      expect(console.info).toHaveBeenCalledWith('[ops] visibility', expect.objectContaining({ id: 'kestrel-75', active: true }))
    })
  })

  describe('hiding', () => {
    it('reports units held and open orders, without blocking', async () => {
      reads = [[LIVE], [{ openOrders: 2 }]]
      held = { 'kestrel-75': 3, other: 9 }
      const res = await patch('kestrel-75', { dryRun: true, active: false })
      expect((await body(res)).data).toEqual({
        applied: false,
        changed: true,
        active: false,
        stockQty: 4,
        hasPhotos: true,
        held: 3,
        openOrders: 2,
      })
    })

    it('hides the product and says so on Telegram', async () => {
      reads = [[LIVE], [{ openOrders: 0 }]]
      await patch('kestrel-75', { dryRun: false, active: false })
      expect(updates[0]).toEqual({ set: { isActive: false }, where: { eq: [products.id, 'kestrel-75'] } })
      expect(sendTelegram.mock.calls[0]?.[0]).toContain('Hidden from the Mac: kestrel-75')
    })
  })

  it('changes nothing, and tells no one, when the product is already that way', async () => {
    reads = [[LIVE]]
    const res = await patch('kestrel-75', { dryRun: false, active: true })
    expect((await body(res)).data).toMatchObject({ applied: false, changed: false })
    expect(updates).toEqual([])
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('answers 404 when the product was deleted between the check and the write', async () => {
    updateAffects = 0
    expect((await patch('kestrel-75', { dryRun: false, active: true })).status).toBe(404)
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('still answers 200 when Telegram fails', async () => {
    sendTelegram.mockRejectedValueOnce(new Error('telegram down'))
    expect((await patch('kestrel-75', { dryRun: false, active: true })).status).toBe(200)
  })
})
