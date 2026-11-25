import { beforeEach, describe, expect, it, vi } from 'vitest'

let session: { user?: { id?: string } } | null = null
const sets: unknown[] = []
const wheres: unknown[] = []

vi.mock('@/lib/auth', () => ({ auth: async () => session }))
vi.mock('@/db', () => {
  const c: Record<string, unknown> = {
    set: (patch: unknown) => {
      sets.push(patch)
      return c
    },
    where: (w: unknown) => {
      wheres.push(w)
      return c
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve([{ affectedRows: 1 }]).then(resolve),
  }
  return { db: { update: () => c } }
})

const { PATCH } = await import('./route')

function req(body: unknown): Request {
  return new Request('http://localhost/api/v1/account/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  session = { user: { id: 'u1' } }
  sets.length = 0
  wheres.length = 0
})

describe('PATCH /api/v1/account/profile', () => {
  it('refuses without a session', async () => {
    session = null
    expect((await PATCH(req({ name: 'A' }))).status).toBe(401)
    expect(sets).toHaveLength(0)
  })

  it('saves a trimmed name for the signed-in user only', async () => {
    const res = await PATCH(req({ name: '  Min Ko  ' }))
    expect(res.status).toBe(200)
    expect(sets).toEqual([{ name: 'Min Ko' }])
    expect(wheres).toHaveLength(1)
    expect((await res.json()).data).toEqual({ name: 'Min Ko' })
  })

  it('clears the name when it is left empty', async () => {
    await PATCH(req({ name: '   ' }))
    expect(sets).toEqual([{ name: null }])
  })

  it('refuses a name over 120 characters, control characters and a bad body', async () => {
    expect((await PATCH(req({ name: 'x'.repeat(121) }))).status).toBe(400)
    expect((await PATCH(req({ name: 'Bad\u0007name' }))).status).toBe(400)
    expect((await PATCH(req('{not json'))).status).toBe(400)
    expect((await PATCH(req({}))).status).toBe(400)
    expect(sets).toHaveLength(0)
  })

  // Shown as the author of public reviews: a blank or reordered name misleads.
  it('refuses invisible and text-direction characters, and a name with no letter or digit', async () => {
    for (const name of ['Min\u202eoK', 'A\u2066b', 'Min\u200f', '---']) {
      expect((await PATCH(req({ name }))).status, JSON.stringify(name)).toBe(400)
    }
    expect(sets).toHaveLength(0)
  })

  it('drops zero-width characters instead, which Burmese keyboards insert', async () => {
    await PATCH(req({ name: 'မင်း\u200bကိုနိုင်' }))
    await PATCH(req({ name: '\ufeffMin' }))
    await PATCH(req({ name: '\u200b' }))
    expect(sets).toEqual([{ name: 'မင်းကိုနိုင်' }, { name: 'Min' }, { name: null }])
  })
})
