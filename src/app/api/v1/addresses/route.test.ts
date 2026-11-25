import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addresses } from '@/db/schema/addresses'

interface Session {
  user?: { id?: string }
}

let session: Session | null = null
let storedRows: unknown[] = []
const wheres: unknown[] = []
const inserts: Record<string, unknown>[] = []

vi.mock('@/lib/auth', () => ({ auth: async () => session }))

// `eq` is reduced to a plain record so the test can see which column was
// filtered and on whose id.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: (col: unknown, value: unknown) => ({ col, value }),
}))

vi.mock('@/db', () => {
  const select = {
    from: () => select,
    where: (cond: unknown) => {
      wheres.push(cond)
      return Promise.resolve(storedRows)
    },
  }
  return {
    db: {
      select: () => select,
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserts.push(v)
          return Promise.resolve({ affectedRows: 1 })
        },
      }),
    },
  }
})

const { GET, POST } = await import('./route')

const VALID = {
  label: 'Home',
  recipient: 'Aung Aung',
  phone: '+959123456789',
  divisionId: 'ygn',
  city: 'Yangon',
  township: 'Sanchaung',
  street: '12 Baho Rd',
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/v1/addresses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  session = { user: { id: 'u1' } }
  storedRows = []
  wheres.length = 0
  inserts.length = 0
})

describe('GET /api/v1/addresses', () => {
  it('refuses an anonymous caller', async () => {
    session = null
    expect((await GET()).status).toBe(401)
    expect(wheres).toHaveLength(0)
  })

  it("returns only the caller's addresses", async () => {
    storedRows = [{ id: 'a1', label: 'Home' }]
    const res = await GET()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: unknown }).data).toEqual(storedRows)
    expect(wheres).toEqual([{ col: addresses.userId, value: 'u1' }])
  })
})

describe('POST /api/v1/addresses', () => {
  it('refuses an anonymous caller', async () => {
    session = null
    expect((await POST(post(VALID))).status).toBe(401)
    expect(inserts).toHaveLength(0)
  })

  it('refuses a malformed body without throwing', async () => {
    expect((await POST(post('not json'))).status).toBe(400)
    expect(inserts).toHaveLength(0)
  })

  it.each(['label', 'recipient', 'phone', 'divisionId', 'city', 'township', 'street'])(
    'refuses a body missing %s',
    async (field) => {
      const body: Record<string, unknown> = { ...VALID }
      delete body[field]
      expect((await POST(post(body))).status).toBe(400)
      expect(inserts).toHaveLength(0)
    },
  )

  it('refuses a phone that is not a Myanmar mobile number', async () => {
    for (const phone of ['+1555551234', '09123456789', '+959']) {
      expect((await POST(post({ ...VALID, phone }))).status).toBe(400)
    }
    expect(inserts).toHaveLength(0)
  })

  it('refuses a link that is not a Google Maps link', async () => {
    const res = await POST(post({ ...VALID, mapsUrl: 'https://evil.example/track' }))
    expect(res.status).toBe(400)
    expect(inserts).toHaveLength(0)
  })

  it('refuses a telegram handle that is not a handle', async () => {
    const res = await POST(post({ ...VALID, telegramUsername: 'no spaces allowed' }))
    expect(res.status).toBe(400)
    expect(inserts).toHaveLength(0)
  })

  it('files the address under the session user, whatever the body claims', async () => {
    const res = await POST(post({ ...VALID, userId: 'someone-else' }))
    expect(res.status).toBe(200)
    expect(inserts[0]).toMatchObject({ ...VALID, userId: 'u1' })
  })

  it('stores the optional fields it is given', async () => {
    const res = await POST(
      post({
        ...VALID,
        landmark: 'Near the pagoda',
        telegramUsername: 'aungaung',
        mapsUrl: 'https://maps.app.goo.gl/abc',
        isDefault: true,
      }),
    )
    expect(res.status).toBe(200)
    expect(inserts[0]).toMatchObject({
      landmark: 'Near the pagoda',
      telegramUsername: 'aungaung',
      mapsUrl: 'https://maps.app.goo.gl/abc',
      isDefault: true,
    })
  })

  it('returns the new uuid it stored', async () => {
    const res = await POST(post(VALID))
    const { data } = (await res.json()) as { data: { id: string } }
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(inserts[0]?.id).toBe(data.id)
  })

  it('stores absent optionals as null and isDefault as false', async () => {
    await POST(post(VALID))
    expect(inserts[0]).toMatchObject({
      landmark: null,
      telegramUsername: null,
      mapsUrl: null,
      isDefault: false,
    })
  })

  it('normalises a pasted telegram link and blank optionals', async () => {
    await POST(post({ ...VALID, telegramUsername: 'https://t.me/aungaung', mapsUrl: '  ' }))
    expect(inserts[0]).toMatchObject({ telegramUsername: 'aungaung', mapsUrl: null })
  })
})
