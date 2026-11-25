import { beforeEach, describe, expect, it, vi } from 'vitest'
import { textVersion, type ProductText } from './product-text'

/** One entry per select, in order: the product row, then its specs. */
let selects: unknown[][] = []
let locked = 0
let updates: unknown[] = []
let deletes = 0
let inserts: unknown[] = []

vi.mock('@/db', () => {
  function chain(result: unknown, onSet?: (patch: unknown) => void) {
    const c: Record<string, unknown> = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      for: () => {
        locked += 1
        return c
      },
      set: (patch: unknown) => {
        onSet?.(patch)
        return c
      },
      values: (v: unknown) => {
        inserts.push(v)
        return c
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    return c
  }
  const tx = {
    select: () => chain(selects.shift() ?? []),
    update: () => chain([], (p) => updates.push(p)),
    delete: () => {
      deletes += 1
      return chain([])
    },
    insert: () => chain([]),
  }
  return {
    db: { ...tx, transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx) },
  }
})

const { editProductText, readProductText } = await import('./product-edit')

const TEXT: ProductText = {
  name: 'Kestrel 75',
  tagline: 'Gasket-mount 75%',
  description: 'Quiet.',
  specs: [
    { label: 'Layout', value: '75%' },
    { label: 'Switches', value: 'Linear' },
  ],
}
const ROW = { id: 'kestrel-75', slug: 'kestrel-75', name: TEXT.name, tagline: TEXT.tagline, description: TEXT.description, isActive: true, hasPhotos: true }
const WAS = textVersion(TEXT)

function stored() {
  selects = [[ROW], TEXT.specs.map((s) => ({ ...s }))]
}

beforeEach(() => {
  selects = []
  locked = 0
  updates = []
  deletes = 0
  inserts = []
})

describe('readProductText', () => {
  it('returns the text, its specs in order and the fingerprint', async () => {
    stored()
    expect(await readProductText('kestrel-75')).toEqual({ ...ROW, specs: TEXT.specs, textVersion: WAS })
  })

  it('returns null for an unknown product', async () => {
    selects = [[]]
    expect(await readProductText('nope')).toBeNull()
  })
})

describe('editProductText', () => {
  it('locks the product and its specs before comparing', async () => {
    stored()
    await editProductText('kestrel-75', WAS, { name: 'Kestrel 75 Pro' }, false)
    expect(locked).toBe(2)
  })

  it('answers not_found for an unknown product', async () => {
    selects = [[]]
    expect(await editProductText('nope', WAS, { name: 'X' }, false)).toEqual({ status: 'not_found' })
  })

  it('answers stale and writes nothing when the text moved since the preview', async () => {
    stored()
    const res = await editProductText('kestrel-75', textVersion({ ...TEXT, name: 'Old' }), { name: 'X' }, false)
    expect(res).toEqual({ status: 'stale' })
    expect(updates).toEqual([])
    expect(deletes).toBe(0)
  })

  it('writes nothing on a dry run, but reports what would change', async () => {
    stored()
    const res = await editProductText('kestrel-75', WAS, { name: 'Kestrel 75 Pro', specs: [] }, true)
    expect(res).toEqual({
      status: 'ok',
      changed: ['name', 'specs'],
      textVersion: textVersion({ ...TEXT, name: 'Kestrel 75 Pro', specs: [] }),
    })
    expect(updates).toEqual([])
    expect(deletes).toBe(0)
  })

  it('writes nothing when nothing would change', async () => {
    stored()
    const res = await editProductText('kestrel-75', WAS, { name: 'Kestrel 75' }, false)
    expect(res).toEqual({ status: 'ok', changed: [], textVersion: WAS })
    expect(updates).toEqual([])
  })

  it('updates only the changed header fields and leaves the specs alone', async () => {
    stored()
    await editProductText('kestrel-75', WAS, { name: 'Kestrel 75 Pro', tagline: TEXT.tagline }, false)
    expect(updates).toEqual([{ name: 'Kestrel 75 Pro' }])
    expect(deletes).toBe(0)
    expect(inserts).toEqual([])
  })

  it('replaces the specs in order without touching the header', async () => {
    stored()
    const specs = [
      { label: 'Switches', value: 'Tactile' },
      { label: 'Layout', value: '75%' },
    ]
    await editProductText('kestrel-75', WAS, { specs }, false)
    expect(updates).toEqual([])
    expect(deletes).toBe(1)
    expect(inserts).toEqual([
      [
        { productId: 'kestrel-75', label: 'Switches', value: 'Tactile', sortOrder: 0 },
        { productId: 'kestrel-75', label: 'Layout', value: '75%', sortOrder: 1 },
      ],
    ])
  })

  it('clears the specs with an empty list', async () => {
    stored()
    await editProductText('kestrel-75', WAS, { specs: [] }, false)
    expect(deletes).toBe(1)
    expect(inserts).toEqual([])
  })
})
