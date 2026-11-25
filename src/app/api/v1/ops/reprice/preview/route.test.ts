import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '@/lib/auth-tokens'
import { resetBuckets } from '@/lib/rate-limit'

const TOKEN = 'e'.repeat(64)
let rows: Record<string, unknown>[] = []
let reads = 0

// Only `select` exists: a preview that tried to write would throw.
vi.mock('@/db', () => {
  const q = { from: () => Promise.resolve(rows) }
  return {
    db: {
      select: () => {
        reads += 1
        return q
      },
    },
  }
})

const { POST } = await import('./route')

let ip = 0
function preview(body: unknown, token: string | null = TOKEN): Request {
  ip += 1
  return new Request('https://techx-store.online/api/v1/ops/reprice/preview', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.50.0.${ip}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

function row(id: string, over: Record<string, unknown> = {}) {
  return { id, name: id, categoryId: 'keyboards', priceMmk: 250_000, salePriceMmk: null, isActive: true, ...over }
}

beforeEach(() => {
  resetBuckets()
  vi.stubEnv('OPS_TOKEN_SHA256', hashToken(TOKEN))
  rows = [row('kestrel-75'), row('pulse-pro', { categoryId: 'mice', priceMmk: 80_000, salePriceMmk: 70_000 })]
  reads = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
})

interface Plan {
  data: { changes: { id: string; priceMmk: number }[]; blocked: { id: string; reason: string }[] }
}

describe('POST /api/v1/ops/reprice/preview', () => {
  it('refuses a request without the token, before reading anything', async () => {
    expect((await POST(preview({ percent: 8, roundTo: 1000 }, null))).status).toBe(401)
    expect(reads).toBe(0)
  })

  it('lists every change the reprice would make, and writes nothing', async () => {
    const res = await POST(preview({ percent: 8, roundTo: 1000 }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = (await res.json()) as Plan
    expect(body.data.changes.map((c) => [c.id, c.priceMmk])).toEqual([
      ['kestrel-75', 270_000],
      ['pulse-pro', 86_000],
    ])
    expect(body.data.blocked).toEqual([])
  })

  it('narrows to a category', async () => {
    const body = (await (await POST(preview({ percent: 8, roundTo: 1000, category: 'mice' }))).json()) as Plan
    expect(body.data.changes.map((c) => c.id)).toEqual(['pulse-pro'])
  })

  it('reports the products that block the run', async () => {
    rows = [row('tight', { priceMmk: 10_400, salePriceMmk: 10_000 })]
    const body = (await (await POST(preview({ percent: 0.01, roundTo: 1000 }))).json()) as Plan
    expect(body.data.blocked.map((b) => b.id)).toEqual(['tight'])
  })

  it.each([
    ['a percent below the floor', { percent: -51, roundTo: 1000 }],
    ['a percent above the ceiling', { percent: 101, roundTo: 1000 }],
    ['a percent finer than a hundredth', { percent: 8.125, roundTo: 1000 }],
    ['a rounding step outside the set', { percent: 8, roundTo: 5000 }],
    ['an unknown category', { percent: 8, roundTo: 1000, category: 'toasters' }],
    ['no percent at all', { roundTo: 1000 }],
  ])('refuses %s', async (_label, body) => {
    expect((await POST(preview(body))).status).toBe(400)
    expect(reads).toBe(0)
  })
})
