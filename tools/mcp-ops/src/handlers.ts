import { z } from 'zod'
import {
  OpsError,
  assertProductList,
  formatProductList,
  isProductId,
  type OpsCategory,
  type OpsProduct,
  type ProductFilter,
  type ProductList,
} from './core.ts'
import { formatNewProduct } from './new-product.ts'
import {
  formatStockChange,
  formatVisibility,
  noPhotosText,
  stockWarnings,
  visibilityWarnings,
  type VisibilityReport,
} from './inventory.ts'
import type { PreviewStore } from './preview-store.ts'
import { fail, failure, stored as storePlan, type ToolResult } from './results.ts'
import { applyEdit, type EditPlan } from './handlers-edit.ts'
import {
  assertRepricePlan,
  buildPriceChange,
  findProduct,
  formatBlocked,
  formatPriceChanges,
  priceWarnings,
  repriceWarnings,
  type PriceChange,
} from './prices.ts'

/*
 * What each MCP tool does, apart from the MCP wiring in index.ts, so tests can
 * drive them against a fake ops API.
 */

export type { ToolResult }

/** The most changes `PATCH /api/v1/ops/prices` takes in one request. */
export const MAX_CHANGES = 500

/** A previewed change, waiting for apply_preview. */
export type StoredPlan =
  | { kind: 'prices'; changes: PriceChange[] }
  | { kind: 'stock'; id: string; add: number; stockWas: number }
  | { kind: 'visibility'; id: string; active: boolean; force: boolean }
  | { kind: 'create'; body: NewProductBody & { slug: string } }
  | EditPlan

/** The fields `POST /api/v1/ops/products` takes, as sent. */
export interface NewProductBody {
  name: string
  tagline: string
  description: string
  categoryId: string
  priceMmk: number
  salePriceMmk?: number
  stockQty: number
  specs: { label: string; value: string }[]
  slug?: string
}

export type Ops = <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>

export interface Deps {
  ops: Ops
  previews: PreviewStore<StoredPlan>
}

export interface SetPriceArgs {
  product: string
  priceMmk: number
  salePriceMmk?: number | null
}

export interface RepriceArgs {
  percent: number
  roundTo: number
  category?: string
  includeInactive?: boolean
}

/** Input shapes for each tool, as the MCP SDK takes them. */
export const listProductsInput = {
  query: z.string().optional().describe('Part of a product name or slug, any case.'),
  category: z.string().optional().describe('Category id or name, any case, e.g. keyboards, Mice, audio.'),
  active: z.boolean().optional().describe('true for live products only, false for hidden only.'),
}

export const setPriceInput = {
  product: z.string().describe('Product slug (e.g. kestrel-75) or exact name.'),
  priceMmk: z.number().int().min(1).describe('New price in kyat.'),
  salePriceMmk: z.number().int().min(1).nullable().optional().describe('New sale price, or null to end the sale.'),
}

export const repriceInput = {
  percent: z
    .number()
    .min(-50)
    .max(100)
    .refine((p) => Math.abs(p * 100 - Math.round(p * 100)) < 1e-9, 'At most two decimals.')
    .describe('e.g. 8 for +8%, -5 for -5%. At most two decimals.'),
  roundTo: z.union([z.literal(100), z.literal(500), z.literal(1000)]).describe('Round each price to this many kyat.'),
  category: z.string().min(1).optional().describe('Only this category (id or name). Default: every category.'),
  includeInactive: z.boolean().optional().describe('Include hidden products. Default true.'),
}

export const addStockInput = {
  product: z.string().describe('Product slug (e.g. kestrel-75) or exact name.'),
  add: z.number().int().min(1).max(10_000).describe('Units arriving, e.g. 20.'),
}

export const setVisibilityInput = {
  product: z.string().describe('Product slug (e.g. kestrel-75) or exact name.'),
  active: z.boolean().describe('true to publish (live in the shop), false to hide.'),
  force: z.boolean().optional().describe('Publish even with no photos. Only when the owner asks for it.'),
}

export const createProductInput = {
  name: z.string().min(1).max(120).describe('Product name as customers see it.'),
  tagline: z.string().min(1).max(200).describe('One line under the name.'),
  description: z.string().min(1).max(8000).describe('The product page text.'),
  category: z.string().min(1).describe('Category id or name, e.g. keyboards, Mice.'),
  priceMmk: z.number().int().min(1).max(999_999_999).describe('Price in kyat.'),
  salePriceMmk: z.number().int().min(1).max(999_999_999).optional().describe('Sale price in kyat, below the price.'),
  stockQty: z.number().int().min(0).max(100_000).describe('Units in stock.'),
  specs: z
    .array(z.object({ label: z.string().min(1).max(80), value: z.string().min(1).max(200) }))
    .max(40)
    .optional()
    .describe('Spec rows in display order, e.g. {label: "Layout", value: "75%"}.'),
  slug: z
    .string()
    .optional()
    .describe('URL slug: lowercase letters, digits, dashes. Leave out to make it from the name; needed for a name with no Latin letters.'),
}

export const applyPreviewInput = {
  previewId: z.string().describe('The previewId a preview returned.'),
}

const PRICES = '/api/v1/ops/prices'
const PRODUCTS = '/api/v1/ops/products'
const stockPath = (id: string) => `/api/v1/ops/products/${encodeURIComponent(id)}/stock`
const visibilityPath = (id: string) => `/api/v1/ops/products/${encodeURIComponent(id)}/visibility`

async function productList(d: Deps): Promise<ProductList> {
  return assertProductList(await d.ops<unknown>(PRODUCTS))
}

const stored = (d: Deps, plan: StoredPlan, preview: string, warnings: string[]) => storePlan(d.previews, plan, preview, warnings)

export async function listProducts(d: Deps, filter: ProductFilter): Promise<ToolResult> {
  try {
    return { text: formatProductList(await productList(d), filter) }
  } catch (err) {
    return failure(err)
  }
}

export async function setPrice(d: Deps, { product, priceMmk, salePriceMmk }: SetPriceArgs): Promise<ToolResult> {
  try {
    const p = findProduct((await productList(d)).products, product)
    if (!p) return fail(`No product "${product}". Use list_products to find its slug.`)
    if (priceMmk === p.priceMmk && (salePriceMmk === undefined || salePriceMmk === p.salePriceMmk)) {
      return { text: 'Already at that price. Nothing to preview.' }
    }
    const change = buildPriceChange(p, priceMmk, salePriceMmk)
    // The server checks the rules (sale below price, bounds) without writing.
    await d.ops(PRICES, { method: 'PATCH', body: { dryRun: true, changes: [change] } })
    const named = { ...change, name: p.name }
    return stored(d, { kind: 'prices', changes: [change] }, formatPriceChanges([named]), priceWarnings(named))
  } catch (err) {
    return failure(err)
  }
}

/** A category by id or name, any case, or a failure naming the ones that exist. */
function findCategory(categories: readonly OpsCategory[], category: string): OpsCategory | ToolResult {
  const c = category.trim().toLowerCase()
  const found = categories.find((x) => x.id === c || x.name.toLowerCase() === c)
  return found ?? fail(`No category "${category}". Categories: ${categories.map((x) => x.id).join(', ')}.`)
}

async function categoryIdOf(d: Deps, category: string): Promise<string | ToolResult> {
  const found = findCategory((await productList(d)).categories, category)
  return 'text' in found ? found : found.id
}

export async function reprice(d: Deps, { percent, roundTo, category, includeInactive }: RepriceArgs): Promise<ToolResult> {
  try {
    const categoryId = category !== undefined ? await categoryIdOf(d, category) : undefined
    if (typeof categoryId === 'object') return categoryId
    const plan = assertRepricePlan(
      await d.ops<unknown>('/api/v1/ops/reprice/preview', {
        method: 'POST',
        body: { percent, roundTo, category: categoryId, includeInactive: includeInactive ?? true },
      }),
    )
    if (plan.blocked.length > 0) return fail(formatBlocked(plan.blocked))
    if (plan.changes.length === 0) return { text: 'Nothing would change at that percentage and rounding.' }
    if (plan.changes.length > MAX_CHANGES) {
      return fail(`${plan.changes.length} products would change - more than one apply can carry (${MAX_CHANGES}). ` +
        'Reprice one category at a time instead.')
    }
    const changes = plan.changes.map((c) => ({
      id: c.id,
      priceWas: c.priceWas,
      salePriceWas: c.salePriceWas,
      priceMmk: c.priceMmk,
      salePriceMmk: c.salePriceMmk,
    }))
    const header = `Reprice ${percent > 0 ? '+' : ''}${percent}%, rounded to Ks ${roundTo}${categoryId ? `, ${categoryId} only` : ''}.`
    return stored(d, { kind: 'prices', changes }, `${header}\n${formatPriceChanges(plan.changes)}`, repriceWarnings(plan.changes))
  } catch (err) {
    return failure(err)
  }
}

export async function addStock(d: Deps, { product, add }: { product: string; add: number }): Promise<ToolResult> {
  try {
    const p = findProduct((await productList(d)).products, product)
    if (!p) return fail(`No product "${product}". Use list_products to find its slug.`)
    const preview = await d.ops<{ stockQty?: unknown } | null>(stockPath(p.id), {
      method: 'POST',
      body: { dryRun: true, add, stockWas: p.stockQty },
    })
    const total = Number.isInteger(preview?.stockQty) ? (preview!.stockQty as number) : p.stockQty + add
    return stored(d, { kind: 'stock', id: p.id, add, stockWas: p.stockQty }, formatStockChange(p, add, total), stockWarnings(p))
  } catch (err) {
    return failure(err)
  }
}

export interface SetVisibilityArgs {
  product: string
  active: boolean
  force?: boolean
}

export async function setVisibility(d: Deps, { product, active, force = false }: SetVisibilityArgs): Promise<ToolResult> {
  let p: OpsProduct | undefined
  try {
    p = findProduct((await productList(d)).products, product)
    if (!p) return fail(`No product "${product}". Use list_products to find its slug.`)
    if (p.isActive === active) return { text: `Already ${active ? 'live' : 'hidden'}. Nothing to preview.` }
    const report =
      (await d.ops<VisibilityReport | null>(visibilityPath(p.id), {
        method: 'PATCH',
        body: { dryRun: true, active, force },
      })) ?? { stockQty: p.stockQty, hasPhotos: p.hasPhotos }
    const plan: StoredPlan = { kind: 'visibility', id: p.id, active, force }
    const forcedWithoutPhotos = force && active && report.hasPhotos === false
    return stored(d, plan, formatVisibility(p, active, forcedWithoutPhotos), visibilityWarnings(p.id, active, report))
  } catch (err) {
    if (p && isNoPhotos(err)) return fail(noPhotosText(p.id))
    return failure(err)
  }
}

export interface CreateProductArgs {
  name: string
  tagline: string
  description: string
  category: string
  priceMmk: number
  salePriceMmk?: number
  stockQty: number
  specs?: { label: string; value: string }[]
  slug?: string
}

export async function createProduct(d: Deps, args: CreateProductArgs): Promise<ToolResult> {
  try {
    const category = findCategory((await productList(d)).categories, args.category)
    if ('text' in category) return category
    const body: NewProductBody = {
      name: args.name,
      tagline: args.tagline,
      description: args.description,
      categoryId: category.id,
      priceMmk: args.priceMmk,
      ...(args.salePriceMmk === undefined ? {} : { salePriceMmk: args.salePriceMmk }),
      stockQty: args.stockQty,
      specs: args.specs ?? [],
      ...(args.slug === undefined ? {} : { slug: args.slug }),
    }
    const preview = await d.ops<{ slug?: unknown } | null>(PRODUCTS, { method: 'POST', body: { dryRun: true, ...body } })
    if (!isProductId(preview?.slug)) {
      throw new OpsError('BAD_RESPONSE', 200, 'The ops API answered with an unexpected slug.')
    }
    const slug = preview!.slug as string
    // The slug is pinned in the plan, so apply creates exactly what was previewed.
    const plan: StoredPlan = { kind: 'create', body: { ...body, slug } }
    const text = formatNewProduct({ ...body, slug, categoryName: category.name, salePriceMmk: body.salePriceMmk ?? null })
    return stored(d, plan, `${text}\nAfter it is created: upload photos in /admin/products, then publish it with set_visibility.`, [])
  } catch (err) {
    return failure(err)
  }
}

/** Sends a stored plan for real. Throws what the ops API throws. */
async function applyPlan(d: Deps, plan: StoredPlan): Promise<ToolResult> {
  if (plan.kind === 'prices') {
    const done = await d.ops<{ count?: unknown } | null>(PRICES, { method: 'PATCH', body: { dryRun: false, changes: plan.changes } })
    if (typeof done?.count !== 'number') return unknownResult('The shop answered, but not with a count.', plan.kind)
    return { text: `Applied ${done.count} price change${done.count === 1 ? '' : 's'}. Reload /admin/products if it is open.` }
  }
  if (plan.kind === 'stock') {
    const done = await d.ops<{ stockQty?: unknown } | null>(stockPath(plan.id), {
      method: 'POST',
      body: { dryRun: false, add: plan.add, stockWas: plan.stockWas },
    })
    if (!Number.isInteger(done?.stockQty)) return unknownResult('The shop answered, but not with the new stock.', plan.kind)
    return { text: `Added ${plan.add} to ${plan.id}; stock is now ${done!.stockQty as number}. Reload /admin/products if it is open.` }
  }
  if (plan.kind === 'edit') {
    return (await applyEdit(d.ops, plan)) ?? unknownResult('The shop answered, but not with the result.', plan.kind)
  }
  if (plan.kind === 'create') {
    const done = await d.ops<{ id?: unknown } | null>(PRODUCTS, { method: 'POST', body: { dryRun: false, ...plan.body } })
    // Anything but the previewed slug means the answer is not about this create.
    if (done?.id !== plan.body.slug) return unknownResult('The shop answered, but not with the previewed slug.', plan.kind)
    return {
      text: `Created ${plan.body.slug}, hidden and without photos. Upload photos in /admin/products, then publish it with set_visibility.`,
    }
  }
  const done = await d.ops<{ applied?: unknown } | null>(visibilityPath(plan.id), {
    method: 'PATCH',
    body: { dryRun: false, active: plan.active, force: plan.force },
  })
  if (typeof done?.applied !== 'boolean') return unknownResult('The shop answered, but not with the result.', plan.kind)
  return { text: `${plan.id} is now ${plan.active ? 'live' : 'hidden'}. Reload /admin/products if it is open.` }
}

/** Visibility has no compare-and-set, so it never answers STALE. */
const STALE_TEXT: Partial<Record<StoredPlan['kind'], string>> = {
  prices: 'Prices changed since the preview, so nothing was applied. Preview again.',
  stock: 'Stock changed since the preview (an order may have come in), so nothing was applied. Preview again.',
  edit: 'The product text changed since the preview (an admin save or another edit), so nothing was applied. Run get_product and preview again.',
}

export async function applyPreview(d: Deps, { previewId }: { previewId: string }): Promise<ToolResult> {
  const plan = d.previews.take(previewId)
  if (!plan) return fail('That preview has expired, was already used, or does not exist. Preview again.')
  try {
    return await applyPlan(d, plan)
  } catch (err) {
    const stale = err instanceof OpsError && err.code === 'STALE' ? STALE_TEXT[plan.kind] : undefined
    if (stale) return fail(stale)
    if (plan.kind === 'visibility' && isNoPhotos(err)) return fail(noPhotosText(plan.id))
    return refusedBeforeWriting(err) ? failure(err) : unknownResult((err as Error).message, plan.kind)
  }
}

/**
 * Only a definite refusal means nothing landed: a 4xx answer, or a failure
 * before the request left the Mac (the Keychain read, the path guard). A
 * timeout, a 5xx or an unreadable answer may follow a committed write.
 */
function refusedBeforeWriting(err: unknown): boolean {
  if (!(err instanceof OpsError)) return true
  return (err.status >= 400 && err.status < 500) || err.code === 'BAD_PATH'
}

const isNoPhotos = (err: unknown) => err instanceof OpsError && err.code === 'NO_PHOTOS'

/** What to check before trying again, so a change that did land is not made twice. */
const CHECK_FIRST: Record<StoredPlan['kind'], string> = {
  prices: 'Run list_products to check the prices before previewing again.',
  stock: 'Run list_products to check the stock before adding it again.',
  visibility: 'Run list_products to check whether it is live before previewing again.',
  create: 'Run list_products to check whether it was created before trying again.',
  edit: 'Run get_product to check the text before previewing again.',
}

function unknownResult(detail: string, kind: StoredPlan['kind']): ToolResult {
  return fail(`Result unknown - the change may have been applied (${detail}) ${CHECK_FIRST[kind]}`)
}
