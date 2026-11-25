import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DrizzleQueryError } from 'drizzle-orm'
import { products, productSpecs } from '@/db/schema/products'
import { slugify } from './slugify'
import type { NewProduct } from './product-create'

/** One entry per `db.select()`, in order. */
let selects: unknown[][] = []
const inserts: [unknown, unknown][] = []
let insertError: Error | null = null
let transactions = 0

vi.mock('@/db', () => {
  function chain(result: unknown, table?: unknown) {
    const c: Record<string, unknown> = {
      from: () => c,
      where: () => c,
      limit: () => c,
      values: (v: unknown) => {
        inserts.push([table, v])
        if (insertError && table === products) return Promise.reject(insertError)
        return c
      },
      then: (resolve: (value: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return c
  }
  const tx = { insert: (table: unknown) => chain(undefined, table) }
  return {
    db: {
      select: () => chain(selects.shift() ?? []),
      transaction: async (cb: (t: typeof tx) => Promise<unknown>) => {
        transactions += 1
        return cb(tx)
      },
    },
  }
})

const { SLUG_MAX, SlugTakenError, insertProduct, saleProblem, slugFromName, slugSchema, slugTaken } = await import(
  './product-create'
)

const BOARD: NewProduct = {
  slug: 'test-board',
  name: 'Test Board',
  categoryId: 'keyboards',
  priceMmk: 100_000,
  salePriceMmk: null,
  tagline: 'A board',
  description: 'A board for testing.',
  swatch: '#3D342A',
  stockQty: 5,
  lowStockThreshold: 3,
  isActive: false,
  featured: false,
  sortOrder: 0,
  specs: [
    { label: 'Switches', value: 'Linear' },
    { label: 'Layout', value: '75%' },
  ],
}

beforeEach(() => {
  selects = []
  inserts.length = 0
  insertError = null
  transactions = 0
})

describe('slugs', () => {
  it('makes a slug from a name', () => {
    expect(slugFromName('Kestrel 75')).toBe('kestrel-75')
    expect(slugFromName('Café Board')).toBe('cafe-board')
  })

  it('has none for a name with no Latin letters or digits, so the caller must give one', () => {
    expect(slugFromName('ကီးဘုတ်')).toBeNull()
    expect(slugFromName('!!')).toBeNull()
  })

  it('has none for a name that would give a one-character slug', () => {
    expect(slugFromName('A')).toBeNull()
  })

  it('caps at 64 characters - the products.id column - without a dangling dash', () => {
    const slug = slugFromName(`${'x'.repeat(63)} yyy`)
    expect(slug).toBe('x'.repeat(63))
    expect(slugify('word '.repeat(30)).length).toBeLessThanOrEqual(SLUG_MAX)
    expect(slugify('word '.repeat(30))).not.toMatch(/-$/)
  })

  it('refuses a given slug longer than 64 characters, which used to fail the insert', () => {
    expect(slugSchema.safeParse('a'.repeat(64)).success).toBe(true)
    expect(slugSchema.safeParse('a'.repeat(65)).success).toBe(false)
    expect(slugSchema.safeParse('-bad').success).toBe(false)
  })
})

describe('saleProblem', () => {
  it('accepts no sale, or a sale below the price', () => {
    expect(saleProblem(100_000, null)).toBeNull()
    expect(saleProblem(100_000, 90_000)).toBeNull()
  })

  it("refuses a sale at the price, in admin's wording", () => {
    expect(saleProblem(100_000, 100_000)).toMatch(/below the normal price/)
  })
})

describe('slugTaken', () => {
  it('looks the slug up as an id', async () => {
    selects = [[{ id: 'test-board' }]]
    expect(await slugTaken('test-board')).toBe(true)
    expect(await slugTaken('free-slug')).toBe(false)
  })
})

describe('insertProduct', () => {
  it('writes the product, id equal to slug and no photos, with its specs in order, in one transaction', async () => {
    await insertProduct(BOARD)
    expect(transactions).toBe(1)
    expect(inserts).toEqual([
      [
        products,
        {
          id: 'test-board',
          slug: 'test-board',
          name: 'Test Board',
          categoryId: 'keyboards',
          priceMmk: 100_000,
          salePriceMmk: null,
          tagline: 'A board',
          description: 'A board for testing.',
          swatch: '#3D342A',
          stockQty: 5,
          lowStockThreshold: 3,
          hasPhotos: false,
          isActive: false,
          featured: false,
          sortOrder: 0,
        },
      ],
      [
        productSpecs,
        [
          { productId: 'test-board', label: 'Switches', value: 'Linear', sortOrder: 0 },
          { productId: 'test-board', label: 'Layout', value: '75%', sortOrder: 1 },
        ],
      ],
    ])
  })

  it('writes no spec rows when there are none', async () => {
    await insertProduct({ ...BOARD, specs: [] })
    expect(inserts.map(([t]) => t)).toEqual([products])
  })

  it('turns a duplicate key - two creates racing past the check - into SlugTakenError', async () => {
    insertError = new DrizzleQueryError('insert ...', [], Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }))
    await expect(insertProduct(BOARD)).rejects.toBeInstanceOf(SlugTakenError)
  })

  it('lets any other failure through unchanged', async () => {
    insertError = new Error('connection lost')
    await expect(insertProduct(BOARD)).rejects.toThrow('connection lost')
  })
})
