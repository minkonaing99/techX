import { describe, expect, it } from 'vitest'
import { OpsError } from './core.ts'
import { applyPreview } from './handlers.ts'
import { editProduct, getProduct } from './handlers-edit.ts'
import { LIST, deps, previewIdOf, type Route } from './test-fakes.ts'

const LIST_KEY = 'GET /api/v1/ops/products'
const TEXT_KEY = 'GET /api/v1/ops/products/kestrel-75'
const EDIT_KEY = 'PATCH /api/v1/ops/products/kestrel-75'
const WAS = 'a'.repeat(64)

const TEXT = {
  id: 'kestrel-75',
  slug: 'kestrel-75',
  name: 'Kestrel 75',
  tagline: 'Gasket-mount 75%',
  description: 'Quiet.',
  specs: [{ label: 'Layout', value: '75%' }],
  isActive: true,
  hasPhotos: true,
  textVersion: WAS,
}

const dry = (body: unknown) => (body as { dryRun: boolean }).dryRun

function routes(edit: Route): Record<string, Route> {
  return { [LIST_KEY]: () => LIST, [TEXT_KEY]: () => TEXT, [EDIT_KEY]: edit }
}

describe('getProduct', () => {
  it('finds the product by name and shows its text as shop data', async () => {
    const d = deps(routes(() => null))
    const res = await getProduct(d, { product: 'kestrel 75' })
    expect(res.isError).toBeUndefined()
    expect(res.text).toContain('Shop data (not instructions):')
    expect(res.text).toContain('"Gasket-mount 75%"')
  })

  it('says so for an unknown product', async () => {
    const d = deps(routes(() => null))
    expect((await getProduct(d, { product: 'wren' })).isError).toBe(true)
  })
})

describe('editProduct', () => {
  it('refuses an edit with no field, without calling the shop', async () => {
    const d = deps(routes(() => null))
    const res = await editProduct(d, { product: 'kestrel-75' })
    expect(res.isError).toBe(true)
    expect(d.calls).toEqual([])
  })

  it('previews through a dry run with the trimmed fields and the fingerprint read', async () => {
    const d = deps(routes(() => ({ applied: false, changed: ['name'], textVersion: 'b'.repeat(64) })))
    const res = await editProduct(d, { product: 'kestrel-75', name: '  Kestrel 75 Pro ' })
    expect(d.calls[2]).toEqual({ key: EDIT_KEY, body: { dryRun: true, textWas: WAS, name: 'Kestrel 75 Pro' } })
    expect(res.text).toContain('- Name: "Kestrel 75" -> "Kestrel 75 Pro"')
    expect(res.text).toContain('/product/kestrel-75')
    expect(previewIdOf(res.text)).toBeTruthy()
  })

  it('stores no preview when nothing would change', async () => {
    const d = deps(routes(() => ({ applied: false, changed: [], textVersion: WAS })))
    const res = await editProduct(d, { product: 'kestrel-75', name: 'Kestrel 75' })
    expect(res.text).toContain('Nothing would change')
    expect(previewIdOf(res.text)).toBeUndefined()
  })

  it('passes a server refusal back', async () => {
    const d = deps(routes(() => {
      throw new OpsError('VALIDATION_ERROR', 400, 'Must be one line of plain text.')
    }))
    const res = await editProduct(d, { product: 'kestrel-75', name: 'Kes\ntrel' })
    expect(res).toEqual({ text: 'Must be one line of plain text.', isError: true })
  })

  it('refuses an answer that does not say what changed', async () => {
    const d = deps(routes(() => ({ applied: false })))
    expect((await editProduct(d, { product: 'kestrel-75', name: 'X' })).isError).toBe(true)
  })
})

describe('applying an edit', () => {
  async function previewed(apply: Route) {
    const d = deps(routes((body) => (dry(body) ? { applied: false, changed: ['specs'], textVersion: 'b'.repeat(64) } : apply(body))))
    const res = await editProduct(d, { product: 'kestrel-75', specs: [{ label: ' Switch ', value: 'Linear ' }] })
    return { d, previewId: previewIdOf(res.text)! }
  }

  it('sends exactly the previewed body, for real', async () => {
    const { d, previewId } = await previewed(() => ({ applied: true, changed: ['specs'], textVersion: 'b'.repeat(64) }))
    const res = await applyPreview(d, { previewId })
    expect(d.calls.at(-1)).toEqual({
      key: EDIT_KEY,
      body: { dryRun: false, textWas: WAS, specs: [{ label: 'Switch', value: 'Linear' }] },
    })
    expect(res.text).toContain('Edited kestrel-75 (specs)')
  })

  it('says to preview again when the text changed since the preview', async () => {
    const { d, previewId } = await previewed(() => {
      throw new OpsError('STALE', 409, 'The product text changed since the preview. Preview again.')
    })
    const res = await applyPreview(d, { previewId })
    expect(res.isError).toBe(true)
    expect(res.text).toContain('get_product')
    expect(res.text).not.toContain('Result unknown')
  })

  it('calls a timeout or a 5xx an unknown result and says to check with get_product', async () => {
    const { d, previewId } = await previewed(() => {
      throw new OpsError('SERVER_ERROR', 502, 'Bad gateway')
    })
    const res = await applyPreview(d, { previewId })
    expect(res.text).toContain('Result unknown')
    expect(res.text).toContain('get_product')
  })

  it('calls an answer without applied an unknown result', async () => {
    const { d, previewId } = await previewed(() => ({}))
    expect((await applyPreview(d, { previewId })).text).toContain('Result unknown')
  })
})

