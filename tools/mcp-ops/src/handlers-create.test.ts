import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { OpsError } from './core.ts'
import { applyPreview, createProduct, createProductInput } from './handlers.ts'
import { LIST, deps, previewIdOf, type Route } from './test-fakes.ts'

const CREATE = 'POST /api/v1/ops/products'
const dry = (body: unknown) => (body as { dryRun: boolean }).dryRun

const ARGS = {
  name: 'Kestrel 75',
  tagline: 'A compact board',
  description: 'Gasket mount, hot-swap.',
  category: 'Keyboards',
  priceMmk: 250_000,
  stockQty: 4,
}

const SENT = {
  name: 'Kestrel 75',
  tagline: 'A compact board',
  description: 'Gasket mount, hot-swap.',
  categoryId: 'keyboards',
  priceMmk: 250_000,
  stockQty: 4,
  specs: [],
}

describe('createProduct', () => {
  it('previews through a server dry run, with the category by name sent as its id', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST, [CREATE]: () => ({ applied: false, id: 'kestrel-75', slug: 'kestrel-75' }) })
    const res = await createProduct(d, ARGS)
    expect(d.calls[1]).toEqual({ key: CREATE, body: { dryRun: true, ...SENT } })
    expect(res.text).toContain('- Name: "Kestrel 75"')
    expect(res.text).toContain('- Slug: kestrel-75 | Keyboards | Ks 250,000 | stock 4')
    expect(res.text).toContain('set_visibility')
    expect(previewIdOf(res.text)).toBeTruthy()
  })

  it('sends a sale price, specs and a slug only when given', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST, [CREATE]: () => ({ applied: false, id: 'kb-v2', slug: 'kb-v2' }) })
    await createProduct(d, { ...ARGS, salePriceMmk: 200_000, specs: [{ label: 'Layout', value: '75%' }], slug: 'kb-v2' })
    expect(d.calls[1]?.body).toEqual({
      dryRun: true,
      ...SENT,
      salePriceMmk: 200_000,
      specs: [{ label: 'Layout', value: '75%' }],
      slug: 'kb-v2',
    })
  })

  it('names the categories when given one that does not exist', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST })
    const res = await createProduct(d, { ...ARGS, category: 'toasters' })
    expect(res.isError).toBe(true)
    expect(res.text).toContain('keyboards, mice')
    expect(d.calls).toHaveLength(1)
  })

  it("passes the server's refusal back", async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      [CREATE]: () => {
        throw new OpsError('VALIDATION_ERROR', 400, 'The name has too few Latin letters or digits to make a slug from. Give a slug.')
      },
    })
    const res = await createProduct(d, { ...ARGS, name: 'ကီးဘုတ်' })
    expect(res).toEqual({ text: 'The name has too few Latin letters or digits to make a slug from. Give a slug.', isError: true })
  })

  it('refuses a slug in the answer that could not be a product id, storing nothing', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST, [CREATE]: () => ({ applied: false, id: '..', slug: '..' }) })
    const res = await createProduct(d, ARGS)
    expect(res.isError).toBe(true)
    expect(previewIdOf(res.text)).toBeUndefined()
  })
})

describe('applyPreview for a new product', () => {
  async function created(apply: Route) {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      [CREATE]: (body) => (dry(body) ? { applied: false, id: 'kestrel-75', slug: 'kestrel-75' } : apply(body)),
    })
    const id = previewIdOf((await createProduct(d, ARGS)).text)!
    return { d, res: await applyPreview(d, { previewId: id }) }
  }

  it('creates exactly the previewed product, with the slug the preview showed', async () => {
    const { d, res } = await created(() => ({ applied: true, id: 'kestrel-75', slug: 'kestrel-75' }))
    expect(d.calls.at(-1)).toEqual({ key: CREATE, body: { dryRun: false, ...SENT, slug: 'kestrel-75' } })
    expect(res.text).toMatch(/Created kestrel-75, hidden and without photos/)
  })

  it('reports a slug taken since the preview as nothing created', async () => {
    const { res } = await created(() => {
      throw new OpsError('CONFLICT', 409, 'Slug already in use: kestrel-75. Give another slug.')
    })
    expect(res).toEqual({ text: 'Slug already in use: kestrel-75. Give another slug.', isError: true })
  })

  it('after a timeout, says to check whether it was created before trying again', async () => {
    const { res } = await created(() => {
      throw new OpsError('TIMEOUT', 0, 'timed out')
    })
    expect(res.text).toMatch(/may have been applied/)
    expect(res.text).toMatch(/check whether it was created/)
  })

  it('treats an answer without a usable id as a result that may have landed', async () => {
    const { res } = await created(() => ({ applied: true }))
    expect(res.text).toMatch(/may have been applied/)
  })

  it('treats an answer naming a different product than the preview as a result that may have landed', async () => {
    const { res } = await created(() => ({ applied: true, id: 'other-product', slug: 'other-product' }))
    expect(res.text).toMatch(/may have been applied/)
  })
})

describe('create_product input schema', () => {
  const schema = z.object(createProductInput)

  it.each([
    ['a price of 0', { ...ARGS, priceMmk: 0 }],
    ['a sale of 0', { ...ARGS, salePriceMmk: 0 }],
    ['more than 40 specs', { ...ARGS, specs: Array.from({ length: 41 }, () => ({ label: 'a', value: 'b' })) }],
    ['an empty category', { ...ARGS, category: '' }],
  ])('refuses %s', (_label, input) => {
    expect(schema.safeParse(input).success).toBe(false)
  })

  it('accepts a product', () => {
    expect(schema.safeParse(ARGS).success).toBe(true)
  })
})
