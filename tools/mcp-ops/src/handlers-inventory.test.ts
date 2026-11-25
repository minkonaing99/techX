import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { OpsError } from './core.ts'
import { addStock, addStockInput, applyPreview, setVisibility, setVisibilityInput } from './handlers.ts'
import { KESTREL, LIST, deps, previewIdOf, type Route } from './test-fakes.ts'

const STOCK = 'POST /api/v1/ops/products/kestrel-75/stock'
const VISIBILITY = 'PATCH /api/v1/ops/products/kestrel-75/visibility'
const HIDDEN_LIST = { ...LIST, products: [{ ...KESTREL, isActive: false }] }
const dry = (body: unknown) => (body as { dryRun: boolean }).dryRun
const NO_PHOTOS_TEXT =
  'kestrel-75 has no photos, so it was not published. Ask the owner whether to upload photos first or publish it without them.'

describe('addStock', () => {
  it('previews through a server dry run and hands back a previewId', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST, [STOCK]: () => ({ applied: false, stockQty: 24 }) })
    const res = await addStock(d, { product: 'kestrel-75', add: 20 })
    expect(res.text).toContain('stock 4 -> 24 (+20)')
    expect(previewIdOf(res.text)).toBeTruthy()
    expect(d.calls[1]).toEqual({ key: STOCK, body: { dryRun: true, add: 20, stockWas: 4 } })
  })

  it('says so, and stores nothing, for a product it cannot find', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST })
    const res = await addStock(d, { product: 'nope', add: 1 })
    expect(res.isError).toBe(true)
    expect(previewIdOf(res.text)).toBeUndefined()
  })

  it("passes the server's refusal back", async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      [STOCK]: () => {
        throw new OpsError('VALIDATION_ERROR', 400, 'Stock may be at most 100000.')
      },
    })
    const res = await addStock(d, { product: 'kestrel-75', add: 10_000 })
    expect(res).toEqual({ text: 'Stock may be at most 100000.', isError: true })
  })
})

describe('setVisibility', () => {
  it('previews publishing through a server dry run', async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => HIDDEN_LIST,
      [VISIBILITY]: () => ({ applied: false, changed: true, active: true, stockQty: 4, hasPhotos: true }),
    })
    const res = await setVisibility(d, { product: 'kestrel-75', active: true })
    expect(res.text).toContain('hidden -> live')
    expect(previewIdOf(res.text)).toBeTruthy()
    expect(d.calls[1]).toEqual({ key: VISIBILITY, body: { dryRun: true, active: true, force: false } })
  })

  it('does not preview a product already that way', async () => {
    const d = deps({ 'GET /api/v1/ops/products': () => LIST })
    expect((await setVisibility(d, { product: 'kestrel-75', active: true })).text).toMatch(/Already live/)
    expect(d.calls).toHaveLength(1)
  })

  it('turns the no-photos refusal into a question for the owner, not a nudge to force it', async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => HIDDEN_LIST,
      [VISIBILITY]: () => {
        throw new OpsError('NO_PHOTOS', 409, 'kestrel-75 has no photos. Upload them in /admin/products, or publish with force.')
      },
    })
    const res = await setVisibility(d, { product: 'kestrel-75', active: true })
    expect(res).toEqual({ text: NO_PHOTOS_TEXT, isError: true })
  })

  it('sends force when asked, and still warns about the missing photos', async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => HIDDEN_LIST,
      [VISIBILITY]: () => ({ applied: false, changed: true, active: true, stockQty: 4, hasPhotos: false }),
    })
    const res = await setVisibility(d, { product: 'kestrel-75', active: true, force: true })
    expect(d.calls[1]?.body).toMatchObject({ force: true })
    expect(res.text).toContain('(forced, no photos)')
  })

  it('warns that hiding leaves open orders open', async () => {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      [VISIBILITY]: () => ({ applied: false, changed: true, active: false, stockQty: 4, hasPhotos: true, held: 1, openOrders: 1 }),
    })
    const res = await setVisibility(d, { product: 'kestrel-75', active: false })
    expect(res.text).toContain('live -> hidden')
    expect(res.text).toContain('1 open order (1 unit held for unpaid ones)')
  })
})

describe('applyPreview for stock and visibility', () => {
  async function stockPreview(apply: Route) {
    const d = deps({
      'GET /api/v1/ops/products': () => LIST,
      [STOCK]: (body) => (dry(body) ? { applied: false, stockQty: 24 } : apply(body)),
    })
    const id = previewIdOf((await addStock(d, { product: 'kestrel-75', add: 20 })).text)!
    return { d, res: await applyPreview(d, { previewId: id }) }
  }

  async function visibilityPreview(apply: Route) {
    const d = deps({
      'GET /api/v1/ops/products': () => HIDDEN_LIST,
      [VISIBILITY]: (body) => (dry(body) ? { applied: false, changed: true, active: true, stockQty: 4, hasPhotos: true } : apply(body)),
    })
    const id = previewIdOf((await setVisibility(d, { product: 'kestrel-75', active: true })).text)!
    return { d, res: await applyPreview(d, { previewId: id }) }
  }

  it('adds exactly the previewed delivery over the previewed stock', async () => {
    const { d, res } = await stockPreview(() => ({ applied: true, stockQty: 24 }))
    expect(d.calls.at(-1)).toEqual({ key: STOCK, body: { dryRun: false, add: 20, stockWas: 4 } })
    expect(res.text).toMatch(/Added 20 to kestrel-75; stock is now 24/)
  })

  it('says to preview again when an order took stock since the preview', async () => {
    const { res } = await stockPreview(() => {
      throw new OpsError('STALE', 409, 'Stock changed to 3 since the preview. Preview again.')
    })
    expect(res.isError).toBe(true)
    expect(res.text).toMatch(/Stock changed since the preview.*nothing was applied/)
  })

  it('treats a stock answer without a number as a result that may have landed', async () => {
    const { res } = await stockPreview(() => ({ applied: true }))
    expect(res.text).toMatch(/may have been applied/)
  })

  it('after a timeout, says to check the stock - not the prices - before adding it again', async () => {
    const { res } = await stockPreview(() => {
      throw new OpsError('TIMEOUT', 0, 'timed out')
    })
    expect(res.text).toMatch(/check the stock before adding it again/)
    expect(res.text).not.toMatch(/prices/)
  })

  it('publishes as previewed', async () => {
    const { d, res } = await visibilityPreview(() => ({ applied: true, changed: true }))
    expect(d.calls.at(-1)).toEqual({ key: VISIBILITY, body: { dryRun: false, active: true, force: false } })
    expect(res.text).toMatch(/kestrel-75 is now live/)
  })

  it('treats a server error on publishing as a result that may have landed', async () => {
    const { res } = await visibilityPreview(() => {
      throw new OpsError('INTERNAL_ERROR', 500, 'Something went wrong')
    })
    expect(res.text).toMatch(/may have been applied/)
    expect(res.text).toMatch(/check whether it is live/)
  })

  it('passes a no-photos refusal at apply time back as nothing applied', async () => {
    const { res } = await visibilityPreview(() => {
      throw new OpsError('NO_PHOTOS', 409, 'kestrel-75 has no photos. Upload them in /admin/products, or publish with force.')
    })
    expect(res).toEqual({ text: NO_PHOTOS_TEXT, isError: true })
  })
})

describe('stock and visibility input schemas', () => {
  const addStockSchema = z.object(addStockInput)
  const setVisibilitySchema = z.object(setVisibilityInput)

  it.each([0, 10_001, 1.5])('refuses adding %s units', (add) => {
    expect(addStockSchema.safeParse({ product: 'a', add }).success).toBe(false)
  })

  it('accepts a delivery', () => {
    expect(addStockSchema.safeParse({ product: 'a', add: 20 }).success).toBe(true)
  })

  it('needs active, and takes force only as a boolean', () => {
    expect(setVisibilitySchema.safeParse({ product: 'a' }).success).toBe(false)
    expect(setVisibilitySchema.safeParse({ product: 'a', active: true, force: 'yes' }).success).toBe(false)
    expect(setVisibilitySchema.safeParse({ product: 'a', active: true }).success).toBe(true)
  })
})
