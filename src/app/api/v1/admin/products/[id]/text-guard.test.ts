import { beforeEach, describe, expect, it, vi } from 'vitest'
import { textVersion } from '@/lib/product-text'

const ID = 'kestrel-75'
const TEXT = { name: 'Kestrel 75', tagline: 'Gasket-mount 75%', description: 'Quiet.', specs: [{ label: 'Layout', value: '75%' }] }
const WAS = textVersion(TEXT)

let updates: unknown[] = []
let specWrites = 0

const { lockProductText } = vi.hoisted(() => ({ lockProductText: vi.fn() }))
vi.mock('@/lib/product-edit', () => ({ lockProductText }))
vi.mock('@/lib/admin-guard', () => ({ requireAdmin: async () => null }))
vi.mock('next/cache', () => ({ revalidateTag: () => {} }))

vi.mock('@/db', () => {
  function chain(result: unknown, onSet?: (patch: unknown) => void) {
    const c: Record<string, unknown> = {
      from: () => c,
      where: () => c,
      limit: () => c,
      set: (patch: unknown) => {
        onSet?.(patch)
        return c
      },
      values: () => c,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return c
  }
  const tx = {
    update: () => chain([{ affectedRows: 1 }, []], (p) => updates.push(p)),
    delete: () => {
      specWrites += 1
      return chain(undefined)
    },
    insert: () => {
      specWrites += 1
      return chain(undefined)
    },
  }
  return {
    db: {
      select: () => chain([]),
      transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
    },
  }
})

const { PATCH } = await import('./route')

function patch(body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/v1/admin/products/${ID}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) },
  )
}

async function json(res: Response) {
  return (await res.json()) as { data?: Record<string, unknown>; error?: { code?: string; message?: string } }
}

beforeEach(() => {
  updates = []
  specWrites = 0
  lockProductText.mockReset()
  lockProductText.mockResolvedValue({ id: ID, slug: ID, isActive: true, hasPhotos: true, ...TEXT, textVersion: WAS })
})

describe('PATCH /api/v1/admin/products/[id] - text guard', () => {
  it('saves text that still reads as the page loaded it, and hands back the new fingerprint', async () => {
    const res = await patch({ name: 'Kestrel 75 Pro', tagline: TEXT.tagline, specs: TEXT.specs, textWas: WAS })
    expect(res.status).toBe(200)
    expect(lockProductText).toHaveBeenCalledWith(expect.anything(), ID)
    expect(updates).toEqual([{ name: 'Kestrel 75 Pro', tagline: TEXT.tagline }])
    expect((await json(res)).data?.textVersion).toBe(textVersion({ ...TEXT, name: 'Kestrel 75 Pro' }))
  })

  it('refuses with TEXT_CHANGED, writing nothing, when the text moved since the page loaded', async () => {
    const res = await patch({ name: 'Kestrel 75 Pro', specs: [], textWas: textVersion({ ...TEXT, name: 'Old' }) })
    expect(res.status).toBe(409)
    const body = await json(res)
    expect(body.error?.code).toBe('TEXT_CHANGED')
    expect(body.error?.message).toContain('Reload')
    expect(updates).toEqual([])
    expect(specWrites).toBe(0)
  })

  it('tells a page from before this change to reload', async () => {
    const res = await patch({ description: 'Louder.' })
    expect(res.status).toBe(400)
    expect((await json(res)).error?.message).toContain('Reload')
    expect(lockProductText).not.toHaveBeenCalled()
  })

  it('refuses a textWas of the wrong shape', async () => {
    expect((await patch({ name: 'X', textWas: 'abc' })).status).toBe(400)
  })

  it('answers 404 when the product is gone', async () => {
    lockProductText.mockResolvedValue(null)
    expect((await patch({ name: 'X', textWas: WAS })).status).toBe(404)
  })

  it('leaves inline edits that carry no text unguarded', async () => {
    const res = await patch({ featured: true })
    expect(res.status).toBe(200)
    expect(lockProductText).not.toHaveBeenCalled()
  })
})
