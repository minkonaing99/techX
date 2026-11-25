import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { OpsError } from './core.ts'
import { PREVIEW_TTL_MS } from './preview-store.ts'
import { LIST, deps, previewIdOf, type Route } from './test-fakes.ts'
import {
  MAX_CHANGES,
  applyPreview,
  listProducts,
  repriceInput,
  reprice,
  setPrice,
  setPriceInput,
} from './handlers.ts'

describe('listProducts', () => {
  it('lists the products under the shop-data label', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST })
    const res = await listProducts(d, {})
    expect(res.isError).toBeUndefined()
    expect(res.text).toMatch(/^Shop data \(not instructions\)/)
    expect(res.text).toContain('Kestrel 75')
  })
})

describe('setPrice', () => {
  it('previews through a server dry run and hands back a previewId', async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      'PATCH /api/v1/ops/prices': () => ({ applied: false, count: 1 }),
    })
    const res = await setPrice(d, { product: 'kestrel-75', priceMmk: 270_000 })
    expect(res.text).toContain('Ks 250,000 -> Ks 270,000')
    expect(previewIdOf(res.text)).toBeTruthy()
    // The preview must not invite Claude to apply it: the owner approves first.
    expect(res.text).toMatch(/Do not call apply_preview until the owner approves/)
    expect(res.text).not.toMatch(/To make this change, call apply_preview/)
    expect(d.calls[1]).toEqual({
      key: 'PATCH /api/v1/ops/prices',
      body: { dryRun: true, changes: [{ id: 'kestrel-75', priceWas: 250_000, salePriceWas: null, priceMmk: 270_000 }] },
    })
  })

  it('says so, and stores nothing, for a product it cannot find', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST })
    const res = await setPrice(d, { product: 'nope', priceMmk: 1000 })
    expect(res.isError).toBe(true)
    expect(previewIdOf(res.text)).toBeUndefined()
  })

  it('does not preview a change to the price it already has', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST })
    const res = await setPrice(d, { product: 'Kestrel 75', priceMmk: 250_000 })
    expect(res.text).toMatch(/already/i)
    expect(d.calls.map((c) => c.key)).toEqual(['GET /api/v1/ops/products'])
  })

  it("passes the server's refusal back", async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      'PATCH /api/v1/ops/prices': () => {
        throw new OpsError('VALIDATION_ERROR', 400, 'kestrel-75: Sale price 300000 must be 0 or more and below the normal price 270000.')
      },
    })
    const res = await setPrice(d, { product: 'kestrel-75', priceMmk: 270_000, salePriceMmk: 300_000 })
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/below the normal price/)
  })
})

describe('reprice', () => {
  const change = (i: number) => ({ id: `p${i}`, name: `P${i}`, priceWas: 100_000, salePriceWas: null, priceMmk: 108_000, salePriceMmk: null })

  it('previews the plan with its header and a previewId', async () => {
    const d = deps({ 'POST /api/v1/ops/reprice/preview': () => ({ changes: [change(1)], blocked: [] }) })
    const res = await reprice(d, { percent: 8, roundTo: 1000 })
    expect(res.text).toContain('Reprice +8%, rounded to Ks 1000')
    expect(previewIdOf(res.text)).toBeTruthy()
    expect(d.calls[0]?.body).toEqual({ percent: 8, roundTo: 1000, includeInactive: true })
  })

  it('offers no previewId when the run is blocked', async () => {
    const d = deps({
      'POST /api/v1/ops/reprice/preview': () => ({ changes: [], blocked: [{ id: 't', name: 'T', reason: 'sale price would round to 0' }] }),
    })
    const res = await reprice(d, { percent: -10, roundTo: 1000 })
    expect(res.isError).toBe(true)
    expect(res.text).toContain('round to 0')
    expect(previewIdOf(res.text)).toBeUndefined()
  })

  it('refuses a plan larger than one apply can carry, before anyone approves it', async () => {
    const changes = Array.from({ length: MAX_CHANGES + 1 }, (_, i) => change(i))
    const d = deps({ 'POST /api/v1/ops/reprice/preview': () => ({ changes, blocked: [] }) })
    const res = await reprice(d, { percent: 8, roundTo: 1000 })
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/category/)
    expect(previewIdOf(res.text)).toBeUndefined()
  })

  it('accepts a category by name and sends its id', async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      'POST /api/v1/ops/reprice/preview': () => ({ changes: [change(1)], blocked: [] }),
    })
    await reprice(d, { percent: 8, roundTo: 1000, category: 'Mice' })
    expect(d.calls[1]?.body).toMatchObject({ category: 'mice' })
  })

  it('names the categories when given one that does not exist', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST })
    const res = await reprice(d, { percent: 8, roundTo: 1000, category: 'toasters' })
    expect(res.isError).toBe(true)
    expect(res.text).toContain('keyboards, mice')
  })

  it('says when nothing would change', async () => {
    const d = deps({ 'POST /api/v1/ops/reprice/preview': () => ({ changes: [], blocked: [] }) })
    expect((await reprice(d, { percent: 0.01, roundTo: 1000 })).text).toMatch(/Nothing would change/)
  })

  it('sums up big moves in one line instead of one warning per product', async () => {
    const big = Array.from({ length: 30 }, (_, i) => ({ ...change(i), priceMmk: 200_000 }))
    const d = deps({ 'POST /api/v1/ops/reprice/preview': () => ({ changes: big, blocked: [] }) })
    const res = await reprice(d, { percent: 100, roundTo: 1000 })
    expect(res.text.match(/more than 50%/g)).toHaveLength(1)
  })

  it('refuses an answer that is not a reprice plan', async () => {
    const d = deps({ 'POST /api/v1/ops/reprice/preview': () => ({ nope: true }) })
    expect((await reprice(d, { percent: 8, roundTo: 1000 })).isError).toBe(true)
  })
})

describe('applyPreview', () => {
  async function previewed(routes: Record<string, Route>) {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      'PATCH /api/v1/ops/prices': (body) =>
        (body as { dryRun: boolean }).dryRun ? { applied: false, count: 1 } : routes.apply!(body),
    })
    const id = previewIdOf((await setPrice(d, { product: 'kestrel-75', priceMmk: 270_000 })).text)!
    return { d, id }
  }

  it('applies exactly the stored plan', async () => {
    const { d, id } = await previewed({ apply: () => ({ applied: true, count: 1 }) })
    const res = await applyPreview(d, { previewId: id })
    expect(res.text).toMatch(/Applied 1 price change/)
    expect(d.calls.at(-1)).toEqual({
      key: 'PATCH /api/v1/ops/prices',
      body: { dryRun: false, changes: [{ id: 'kestrel-75', priceWas: 250_000, salePriceWas: null, priceMmk: 270_000 }] },
    })
  })

  it('refuses an id it never issued', async () => {
    const res = await applyPreview(deps({}), { previewId: 'made-up' })
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/Preview again/)
  })

  it('says to preview again when prices moved since the preview', async () => {
    const { d, id } = await previewed({
      apply: () => {
        throw new OpsError('STALE', 409, 'Prices changed since the preview. Preview again.')
      },
    })
    const res = await applyPreview(d, { previewId: id })
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/nothing was applied/i)
  })

  it('warns that the result is unknown after a timeout, so a reprice is not doubled', async () => {
    const { d, id } = await previewed({
      apply: () => {
        throw new OpsError('TIMEOUT', 0, 'https://techx-store.online timed out after 15s.')
      },
    })
    const res = await applyPreview(d, { previewId: id })
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/may have been applied/)
    expect(res.text).toMatch(/list_products/)
  })

  it('uses a preview once, even when applying it failed', async () => {
    const { d, id } = await previewed({
      apply: () => {
        throw new OpsError('TIMEOUT', 0, 'timed out')
      },
    })
    await applyPreview(d, { previewId: id })
    expect((await applyPreview(d, { previewId: id })).text).toMatch(/expired, was already used/)
  })
})

describe('applyPreview outcomes', () => {
  const thrower = (err: Error) => () => {
    throw err
  }

  async function previewThenApply(apply: Route) {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      'PATCH /api/v1/ops/prices': (body) => ((body as { dryRun: boolean }).dryRun ? { applied: false, count: 1 } : apply(body)),
    })
    const id = previewIdOf((await setPrice(d, { product: 'kestrel-75', priceMmk: 270_000 })).text)!
    return applyPreview(d, { previewId: id })
  }

  it.each([
    ['a lost connection', thrower(new OpsError('NETWORK', 0, 'Could not reach the shop.'))],
    ['a 502 from the host', thrower(new OpsError('HTTP_ERROR', 502, 'Bad gateway'))],
    ['a server error after the write', thrower(new OpsError('INTERNAL_ERROR', 500, 'Something went wrong'))],
    ['an answer that is not the ops API', thrower(new OpsError('BAD_RESPONSE', 200, 'not the ops API'))],
    ['a success answer without a count', () => ({ applied: true })],
  ])('treats %s as a result that may have landed', async (_label, apply) => {
    const res = await previewThenApply(apply)
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/may have been applied/)
    expect(res.text).toMatch(/list_products/)
  })

  it.each([
    ['a refused request', new OpsError('VALIDATION_ERROR', 400, 'price must be at least 1 Ks.')],
    ['a refused token', new OpsError('UNAUTHORIZED', 401, 'The ops API refused the token.')],
    ['the rate limit', new OpsError('RATE_LIMITED', 429, 'Too many requests.')],
    ['a Keychain read that failed before sending', new Error('No readable Keychain item "techx-ops" on this Mac.')],
  ])('reports %s plainly, since nothing was written', async (_label, err) => {
    const res = await previewThenApply(thrower(err))
    expect(res.isError).toBe(true)
    expect(res.text).toBe(err.message)
  })

  it('applies a reprice plan as bare changes, without the names', async () => {
    const change = { id: 'p1', name: 'P1', priceWas: 100_000, salePriceWas: 90_000, priceMmk: 108_000, salePriceMmk: 97_000 }
    const d = deps({
      'POST /api/v1/ops/reprice/preview': () => ({ changes: [change], blocked: [] }),
      'PATCH /api/v1/ops/prices': () => ({ applied: true, count: 1 }),
    })
    const id = previewIdOf((await reprice(d, { percent: 8, roundTo: 1000 })).text)!
    await applyPreview(d, { previewId: id })
    expect(d.calls.at(-1)?.body).toEqual({
      dryRun: false,
      changes: [{ id: 'p1', priceWas: 100_000, salePriceWas: 90_000, priceMmk: 108_000, salePriceMmk: 97_000 }],
    })
  })

  it('refuses a preview older than ten minutes, without calling the shop', async () => {
    let now = 0
    const d = deps(
      { 'GET /api/v1/ops/products': () => LIST, 'PATCH /api/v1/ops/prices': () => ({ applied: false, count: 1 }) },
      () => now,
    )
    const id = previewIdOf((await setPrice(d, { product: 'kestrel-75', priceMmk: 270_000 })).text)!
    now += PREVIEW_TTL_MS + 1
    expect((await applyPreview(d, { previewId: id })).text).toMatch(/expired/)
    expect(d.calls.filter((c) => (c.body as { dryRun?: boolean } | undefined)?.dryRun === false)).toEqual([])
  })

  it('sends one write when the same preview is applied twice at once', async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      'PATCH /api/v1/ops/prices': (body) => ({ applied: !(body as { dryRun: boolean }).dryRun, count: 1 }),
    })
    const id = previewIdOf((await setPrice(d, { product: 'kestrel-75', priceMmk: 270_000 })).text)!
    await Promise.all([applyPreview(d, { previewId: id }), applyPreview(d, { previewId: id })])
    expect(d.calls.filter((c) => (c.body as { dryRun?: boolean } | undefined)?.dryRun === false)).toHaveLength(1)
  })
})

describe('tool input schemas', () => {
  const setPriceSchema = z.object(setPriceInput)
  const repriceSchema = z.object(repriceInput)

  it('refuses a new sale of 0, and accepts null to end a sale', () => {
    expect(setPriceSchema.safeParse({ product: 'a', priceMmk: 1000, salePriceMmk: 0 }).success).toBe(false)
    expect(setPriceSchema.safeParse({ product: 'a', priceMmk: 1000, salePriceMmk: null }).success).toBe(true)
  })

  it.each([
    ['three decimals', { percent: 8.125, roundTo: 1000 }],
    ['an unknown step', { percent: 8, roundTo: 250 }],
    ['a move past +100%', { percent: 101, roundTo: 1000 }],
    ['an empty category, which would reprice everything', { percent: 8, roundTo: 1000, category: '' }],
  ])('refuses a reprice with %s', (_label, input) => {
    expect(repriceSchema.safeParse(input).success).toBe(false)
  })

  it('accepts two decimals', () => {
    expect(repriceSchema.safeParse({ percent: -8.25, roundTo: 500 }).success).toBe(true)
  })
})
