import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '@/lib/auth-tokens'
import { resetBuckets } from '@/lib/rate-limit'

const TOKEN = 'b'.repeat(64)

const { revalidateTag, sendTelegram, slugTaken, insertProduct } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  sendTelegram: vi.fn<(text: string) => Promise<void>>(async () => {}),
  slugTaken: vi.fn<(slug: string) => Promise<boolean>>(async () => false),
  insertProduct: vi.fn<(p: unknown) => Promise<void>>(async () => {}),
}))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('@/lib/telegram', () => ({ sendTelegram }))
vi.mock('@/db', () => ({ db: {} }))
vi.mock('@/lib/product-create', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/product-create')>()),
  slugTaken,
  insertProduct,
}))

const { POST } = await import('./route')
const { SlugTakenError } = await import('@/lib/product-create')

let ip = 0
function post(b: unknown, token: string | null = TOKEN) {
  ip += 1
  return POST(
    new Request('https://techx-store.online/api/v1/ops/products', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `10.90.0.${ip}`,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(b),
    }),
  )
}

async function body(res: Response) {
  return (await res.json()) as { data?: unknown; error?: { code: string; message: string } }
}

const NEW = {
  dryRun: false,
  name: 'Kestrel 75',
  tagline: 'A compact board',
  description: 'Gasket mount, hot-swap.',
  categoryId: 'keyboards',
  priceMmk: 250_000,
  stockQty: 4,
  specs: [{ label: 'Layout', value: '75%' }],
}

beforeEach(() => {
  resetBuckets()
  vi.stubEnv('OPS_TOKEN_SHA256', hashToken(TOKEN))
  slugTaken.mockReset()
  slugTaken.mockResolvedValue(false)
  insertProduct.mockReset()
  insertProduct.mockResolvedValue(undefined)
  revalidateTag.mockClear()
  sendTelegram.mockReset()
  sendTelegram.mockResolvedValue(undefined)
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/v1/ops/products', () => {
  it('refuses a request without the token, before checking anything', async () => {
    expect((await post(NEW, null)).status).toBe(401)
    expect(slugTaken).not.toHaveBeenCalled()
  })

  it.each([
    ['no name', { ...NEW, name: '' }],
    ['an unknown category', { ...NEW, categoryId: 'toasters' }],
    ['a price of 0', { ...NEW, priceMmk: 0 }],
    ['a sale of 0', { ...NEW, salePriceMmk: 0 }],
    ['a sale not below the price', { ...NEW, salePriceMmk: 250_000 }],
    ['a slug longer than 64 characters', { ...NEW, slug: 'a'.repeat(65) }],
    ['a malformed slug', { ...NEW, slug: '-kestrel' }],
    ['stock above 100,000', { ...NEW, stockQty: 100_001 }],
    ['a field the ops API does not set, such as isActive', { ...NEW, isActive: true }],
    ['no dryRun flag', { ...NEW, dryRun: undefined }],
    ['a blank tagline', { ...NEW, tagline: '   ' }],
    ['a name over two lines', { ...NEW, name: 'Kestrel\n75' }],
    ['a blank spec value', { ...NEW, specs: [{ label: 'Layout', value: ' ' }] }],
    ['a description of only spaces', { ...NEW, description: ' \n ' }],
    ['a name with a bidi override', { ...NEW, name: 'Kestrel \u202E57' }],
    ['a tagline with a byte-order mark', { ...NEW, tagline: 'A\uFEFFboard' }],
    ['a spec with a line separator', { ...NEW, specs: [{ label: 'Layout', value: '75%\u2028x' }] }],
    ['a description with a NUL', { ...NEW, description: 'Gasket\u0000mount' }],
    ['a description with a bidi isolate', { ...NEW, description: 'Gasket \u2066mount' }],
  ])('refuses %s with 400, creating nothing', async (_label, b) => {
    expect((await post(b)).status).toBe(400)
    expect(insertProduct).not.toHaveBeenCalled()
  })

  it('asks for a slug when the name gives none', async () => {
    const res = await post({ ...NEW, name: 'ကီးဘုတ်' })
    expect(res.status).toBe(400)
    expect((await body(res)).error?.message).toMatch(/slug/)
  })

  it('previews the slug it would use, made from the name, and creates nothing', async () => {
    const res = await post({ ...NEW, dryRun: true })
    expect((await body(res)).data).toEqual({ applied: false, id: 'kestrel-75', slug: 'kestrel-75' })
    expect(slugTaken).toHaveBeenCalledWith('kestrel-75')
    expect(insertProduct).not.toHaveBeenCalled()
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('uses a given slug', async () => {
    const res = await post({ ...NEW, dryRun: true, slug: 'kestrel-75-v2' })
    expect((await body(res)).data).toMatchObject({ slug: 'kestrel-75-v2' })
  })

  it('answers 409 when the slug is taken, even on a dry run', async () => {
    slugTaken.mockResolvedValue(true)
    const res = await post({ ...NEW, dryRun: true })
    expect(res.status).toBe(409)
    expect((await body(res)).error?.code).toBe('CONFLICT')
  })

  it('creates the product hidden, with the fixed defaults, then refreshes, logs and tells the owner', async () => {
    const res = await post(NEW)
    expect((await body(res)).data).toEqual({ applied: true, id: 'kestrel-75', slug: 'kestrel-75' })
    expect(insertProduct).toHaveBeenCalledWith({
      slug: 'kestrel-75',
      name: 'Kestrel 75',
      tagline: 'A compact board',
      description: 'Gasket mount, hot-swap.',
      categoryId: 'keyboards',
      priceMmk: 250_000,
      salePriceMmk: null,
      stockQty: 4,
      specs: [{ label: 'Layout', value: '75%' }],
      swatch: '#7A4F36',
      lowStockThreshold: 3,
      isActive: false,
      featured: false,
      sortOrder: 0,
    })
    expect(revalidateTag).toHaveBeenCalledWith('products')
    expect(sendTelegram.mock.calls[0]?.[0]).toContain('Product created from the Mac (hidden): kestrel-75')
    expect(console.info).toHaveBeenCalledWith('[ops] product created', expect.objectContaining({ id: 'kestrel-75' }))
  })

  it('stores text trimmed, keeping line breaks inside a description', async () => {
    await post({ ...NEW, name: '  Kestrel 75 ', description: ' Line one.\nLine two. ' })
    expect(insertProduct.mock.calls[0]?.[0]).toMatchObject({ name: 'Kestrel 75', description: 'Line one.\nLine two.' })
  })

  it('accepts Burmese text with its zero-width spaces, and tabs in a description', async () => {
    const res = await post({ ...NEW, slug: 'kb-mm', name: 'ကီး\u200Bဘုတ်', description: 'ကီး\u200Bဘုတ်\n\tGasket' })
    expect(res.status).toBe(200)
  })

  it('refuses an oversized body before reading it', async () => {
    const res = await POST(
      new Request('https://techx-store.online/api/v1/ops/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '200000', 'x-forwarded-for': '10.90.9.1', authorization: `Bearer ${TOKEN}` },
        body: '{}',
      }),
    )
    expect(res.status).toBe(413)
  })

  it('takes specs as optional', async () => {
    const noSpecs: Record<string, unknown> = { ...NEW }
    delete noSpecs.specs
    await post(noSpecs)
    expect(insertProduct.mock.calls[0]?.[0]).toMatchObject({ specs: [] })
  })

  it('answers 409 when another create took the slug after the check', async () => {
    insertProduct.mockRejectedValue(new SlugTakenError('kestrel-75'))
    const res = await post(NEW)
    expect(res.status).toBe(409)
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('still answers 200 when Telegram fails', async () => {
    sendTelegram.mockRejectedValueOnce(new Error('telegram down'))
    expect((await post(NEW)).status).toBe(200)
  })
})
