import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'

const ADDRESS_ID = '3aa6e85b-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

interface Session {
  user?: { id?: string }
}

let session: Session | null = null
/** The caller's open order placed with this address, if any. */
let openOrder: { id: string }[] = []
/** Rows the update matched: 0 when the address is gone or someone else's. */
let matched = 1

const updates: unknown[] = []
const deletes = vi.fn()
/** The filter the open-order query ran with; null if it never ran. */
let openOrderWhere: SQL | null = null
let openOrderFails = false

vi.mock('@/lib/auth', () => ({ auth: async () => session }))

vi.mock('@/db', () => {
  // Drizzle's builder is both chainable and awaitable, so every step returns the
  // same object and that object is a thenable.
  function chain(result: unknown, onWhere?: (cond: unknown) => void) {
    const c: Record<string, unknown> = {
      from: () => c,
      limit: () => c,
      set: (patch: unknown) => {
        updates.push(patch)
        return c
      },
      where: (cond: unknown) => {
        onWhere?.(cond)
        return c
      },
      then: (resolve: (value: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return c
  }
  return {
    db: {
      select: () =>
        chain(openOrderFails ? Promise.reject(new Error('db down')) : openOrder, (cond) => {
          openOrderWhere = cond as SQL
        }),
      update: () => chain([{ affectedRows: matched }]),
      delete: () => chain({ affectedRows: 1 }, () => deletes()),
    },
  }
})

const { DELETE, PATCH } = await import('./route')

function ctx(id: string = ADDRESS_ID) {
  return { params: Promise.resolve({ id }) }
}

function patch(body: unknown): Request {
  return new Request(`http://localhost/api/v1/addresses/${ADDRESS_ID}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function del(): Request {
  return new Request(`http://localhost/api/v1/addresses/${ADDRESS_ID}`, { method: 'DELETE' })
}

beforeEach(() => {
  session = { user: { id: 'u1' } }
  openOrder = []
  openOrderWhere = null
  openOrderFails = false
  matched = 1
  updates.length = 0
  deletes.mockClear()
})

describe('PATCH /api/v1/addresses/[id]', () => {
  it('refuses an anonymous caller', async () => {
    session = null
    expect((await PATCH(patch({ label: 'Home' }), ctx())).status).toBe(401)
  })

  it('refuses an id that is not a uuid', async () => {
    expect((await PATCH(patch({ label: 'Home' }), ctx('../../users'))).status).toBe(400)
  })

  it('applies a partial edit and says no open order used the address', async () => {
    const res = await PATCH(patch({ label: 'Office' }), ctx())
    expect(res.status).toBe(200)
    expect(updates[0]).toEqual({ label: 'Office' })
    expect(await res.json()).toEqual({ data: { ok: true, onOpenOrder: false }, error: null })
  })

  it('saves an edit even when an open order was placed with the address, and says so', async () => {
    // Orders keep their own copy of the address, so the edit cannot move them.
    openOrder = [{ id: 'order-1' }]
    const res = await PATCH(patch({ street: '99 New Road' }), ctx())
    expect(res.status).toBe(200)
    expect(updates[0]).toEqual({ street: '99 New Road' })
    expect(await res.json()).toEqual({ data: { ok: true, onOpenOrder: true }, error: null })
  })

  it('never asks about orders for an address that is not the caller\'s', async () => {
    openOrder = [{ id: 'order-1' }]
    matched = 0
    const res = await PATCH(patch({ label: 'Home' }), ctx())
    expect(res.status).toBe(404)
    expect(openOrderWhere).toBeNull()
  })

  it('asks only about the caller\'s own open orders placed with this address', async () => {
    await PATCH(patch({ label: 'Home' }), ctx())
    const { params } = new MySqlDialect().sqlToQuery(openOrderWhere!)
    expect(params).toEqual(expect.arrayContaining([ADDRESS_ID, 'u1', 'pending_payment', 'payment_submitted', 'confirmed']))
    expect(params).not.toContain('delivered')
    expect(params).not.toContain('cancelled')
  })

  it('still reports the save when the open-order check fails', async () => {
    openOrderFails = true
    const res = await PATCH(patch({ label: 'Home' }), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { ok: true, onOpenOrder: false }, error: null })
  })

  it('refuses a phone that is not a Myanmar mobile number', async () => {
    for (const phone of ['+1555551234', '09123456789', '+959']) {
      expect((await PATCH(patch({ phone }), ctx())).status).toBe(400)
    }
    expect(updates).toHaveLength(0)
  })

  it('refuses a telegram handle that is not a handle', async () => {
    const res = await PATCH(patch({ telegramUsername: 'no spaces allowed' }), ctx())
    expect(res.status).toBe(400)
  })

  it('normalises a pasted telegram link down to the handle', async () => {
    await PATCH(patch({ telegramUsername: 'https://t.me/aungaung' }), ctx())
    expect(updates[0]).toEqual({ telegramUsername: 'aungaung' })
  })

  it('stores a cleared optional field as null rather than an empty string', async () => {
    // The form sends '' for an untouched field; keeping that as a value would
    // make "no handle" and "blank handle" two different states.
    await PATCH(patch({ telegramUsername: '', mapsUrl: '' }), ctx())
    expect(updates[0]).toEqual({ telegramUsername: null, mapsUrl: null })
  })

  it('refuses a link that is not a Google Maps link', async () => {
    const res = await PATCH(patch({ mapsUrl: 'https://evil.example/track' }), ctx())
    expect(res.status).toBe(400)
  })

  it('says not found when the address is gone or belongs to someone else', async () => {
    matched = 0
    expect((await PATCH(patch({ label: 'Home' }), ctx())).status).toBe(404)
  })

  it('refuses an edit that changes nothing, rather than failing on the server', async () => {
    expect((await PATCH(patch({}), ctx())).status).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('refuses a malformed body without throwing', async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/v1/addresses/${ADDRESS_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      }),
      ctx(),
    )
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/v1/addresses/[id]', () => {
  it('refuses an anonymous caller', async () => {
    session = null
    expect((await DELETE(del(), ctx())).status).toBe(401)
  })

  it('refuses an id that is not a uuid', async () => {
    expect((await DELETE(del(), ctx('not-a-uuid'))).status).toBe(400)
  })

  it('deletes an address no live order depends on', async () => {
    const res = await DELETE(del(), ctx())
    expect(res.status).toBe(200)
    expect(deletes).toHaveBeenCalledOnce()
  })

  it('deletes an address an open order was placed with; the order keeps its copy', async () => {
    openOrder = [{ id: 'order-1' }]
    const res = await DELETE(del(), ctx())
    expect(res.status).toBe(200)
    expect(deletes).toHaveBeenCalledOnce()
  })
})
