import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '@/lib/auth-tokens'
import { resetBuckets } from '@/lib/rate-limit'
import { CATEGORIES } from '@/lib/categories'
import { products } from '@/db/schema/products'

const TOKEN = 'f'.repeat(64)

let rows: Record<string, unknown>[] = []
let held: Record<string, number> = {}
/** Database reads the route made, and the order it asked for. */
let reads = 0
let orderedBy: unknown[] = []

// Ops routes authenticate by bearer token alone. Reading a cookie would make
// the middleware's exemption from the origin check unsafe.
vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('ops routes must not read cookies')
  },
  headers: () => {
    throw new Error('ops routes must not read request headers through next/headers')
  },
}))
vi.mock('@/lib/auth', () => ({
  auth: () => {
    throw new Error('ops routes must not use the session')
  },
}))
vi.mock('@/lib/held-stock', () => ({
  heldByProduct: async () => {
    reads += 1
    return held
  },
}))

// Order terms reduced to plain records so a test can read them.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  asc: (col: unknown) => ({ asc: col }),
}))
vi.mock('@/db', () => {
  const q = {
    from: () => q,
    orderBy: (...terms: unknown[]) => {
      orderedBy = terms
      return Promise.resolve(rows)
    },
  }
  return {
    db: {
      select: () => {
        reads += 1
        return q
      },
    },
  }
})

const { GET } = await import('./route')

let ip = 0
function get(token: string | null = TOKEN): Request {
  ip += 1
  return new Request('https://techx-store.online/api/v1/ops/products', {
    headers: {
      'x-forwarded-for': `10.40.0.${ip}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  })
}

const ROW = {
  id: 'kestrel-75',
  slug: 'kestrel-75',
  name: 'Kestrel 75',
  categoryId: 'keyboards',
  priceMmk: 250_000,
  salePriceMmk: null,
  stockQty: 4,
  lowStockThreshold: 3,
  isActive: true,
  hasPhotos: true,
  tagline: 'not listed',
  description: 'not listed',
}

beforeEach(() => {
  resetBuckets()
  vi.stubEnv('OPS_TOKEN_SHA256', hashToken(TOKEN))
  rows = [ROW, { ...ROW, id: 'wren-65', slug: 'wren-65', name: 'Wren 65', isActive: false, hasPhotos: false, salePriceMmk: 90_000, priceMmk: 120_000 }]
  held = { 'kestrel-75': 2 }
  reads = 0
  orderedBy = []
})

afterEach(() => {
  vi.unstubAllEnvs()
})

interface Listed {
  data: {
    products: Record<string, unknown>[]
    categories: { id: string; name: string }[]
  }
}

describe('GET /api/v1/ops/products', () => {
  it('answers 404 while the feature is off, without touching the database', async () => {
    vi.stubEnv('OPS_TOKEN_SHA256', '')
    expect((await GET(get())).status).toBe(404)
    expect(reads).toBe(0)
  })

  it('refuses a request without the token, without touching the database', async () => {
    expect((await GET(get(null))).status).toBe(401)
    expect(reads).toBe(0)
  })

  it('lists in display order, with the id as a final tiebreak so the order is stable', async () => {
    await GET(get())
    expect(orderedBy).toEqual([{ asc: products.sortOrder }, { asc: products.name }, { asc: products.id }])
  })

  it('tells caches not to keep the list', async () => {
    const res = await GET(get())
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('does not mistake an inherited name for a held count', async () => {
    rows = [{ ...ROW, id: 'constructor', slug: 'constructor' }]
    held = {}
    const body = (await (await GET(get())).json()) as Listed
    expect(body.data.products[0]?.held).toBe(0)
  })

  it('lists every product, hidden ones included', async () => {
    const body = (await (await GET(get())).json()) as Listed
    expect(body.data.products.map((p) => p.id)).toEqual(['kestrel-75', 'wren-65'])
    expect(body.data.products[1]).toMatchObject({ isActive: false, hasPhotos: false })
  })

  it('gives each product its stock, held units and prices, and nothing else', async () => {
    const body = (await (await GET(get())).json()) as Listed
    expect(body.data.products[0]).toEqual({
      id: 'kestrel-75',
      slug: 'kestrel-75',
      name: 'Kestrel 75',
      categoryId: 'keyboards',
      priceMmk: 250_000,
      salePriceMmk: null,
      stockQty: 4,
      held: 2,
      isActive: true,
      hasPhotos: true,
    })
    expect(body.data.products[1]).toMatchObject({ held: 0, salePriceMmk: 90_000 })
  })

  it('names the categories, so the MCP never keeps its own copy', async () => {
    const body = (await (await GET(get())).json()) as Listed
    expect(body.data.categories).toEqual(CATEGORIES.map((c) => ({ id: c.id, name: c.name })))
  })
})
