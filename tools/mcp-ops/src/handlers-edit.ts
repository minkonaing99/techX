import { z } from 'zod'
import { OpsError, assertProductList } from './core.ts'
import {
  assertProductText,
  editWarnings,
  formatEdit,
  formatProductText,
  type ProductTextData,
  type ProductTextFields,
  type Spec,
  type TextField,
} from './edit-product.ts'
import type { Deps, Ops } from './handlers.ts'
import { findProduct } from './prices.ts'
import { fail, failure, stored, type ToolResult } from './results.ts'

/* get_product and edit_product. Text edits go through apply_preview like every other write. */

export interface EditFields {
  name?: string
  tagline?: string
  description?: string
  specs?: Spec[]
}

/** A previewed text edit: lands only if the product's text still has the fingerprint `textWas`. */
export interface EditPlan {
  kind: 'edit'
  id: string
  textWas: string
  fields: EditFields
}

const product = z.string().describe('Product slug (e.g. kestrel-75) or exact name.')

export const getProductInput = { product }

export const editProductInput = {
  product,
  name: z.string().min(1).max(120).optional().describe('New name. The slug and web address stay as they are.'),
  tagline: z.string().min(1).max(200).optional().describe('New one-line tagline.'),
  description: z
    .string()
    .min(1)
    .max(8000)
    .optional()
    .describe(
      'The whole new description, not just the changed part. A blank line between paragraphs; lines starting ' +
        '"- " or "+ " become a list; a short first line titles its group.',
    ),
  specs: z
    .array(z.object({ label: z.string().min(1).max(80), value: z.string().min(1).max(200) }))
    .max(40)
    .optional()
    .describe('The whole new spec list in display order, replacing the old one. [] removes every spec.'),
}

const PRODUCTS = '/api/v1/ops/products'
const textPath = (id: string) => `${PRODUCTS}/${encodeURIComponent(id)}`
const FIELDS: readonly TextField[] = ['name', 'tagline', 'description', 'specs']

async function lookup(d: Deps, ref: string): Promise<ProductTextData | ToolResult> {
  const found = findProduct(assertProductList(await d.ops<unknown>(PRODUCTS)).products, ref)
  if (!found) return fail(`No product "${ref}". Use list_products to find its slug.`)
  return assertProductText(await d.ops<unknown>(textPath(found.id)))
}

export async function getProduct(d: Deps, { product: ref }: { product: string }): Promise<ToolResult> {
  try {
    const p = await lookup(d, ref)
    return 'text' in p ? p : { text: formatProductText(p) }
  } catch (err) {
    return failure(err)
  }
}

/** Trimmed as the server will store them, so the preview shows exactly what lands. */
function trimmedFields(args: EditFields): EditFields {
  const f: EditFields = {}
  if (args.name !== undefined) f.name = args.name.trim()
  if (args.tagline !== undefined) f.tagline = args.tagline.trim()
  if (args.description !== undefined) f.description = args.description.trim()
  if (args.specs !== undefined) f.specs = args.specs.map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
  return f
}

function changedOf(answer: { changed?: unknown } | null): TextField[] {
  const c = answer?.changed
  if (Array.isArray(c) && c.every((f) => FIELDS.includes(f as TextField))) return c as TextField[]
  throw new OpsError('BAD_RESPONSE', 200, 'The ops API answered without saying what would change.')
}

export async function editProduct(d: Deps, args: EditFields & { product: string }): Promise<ToolResult> {
  const fields = trimmedFields(args)
  if (Object.keys(fields).length === 0) return fail('Give at least one of name, tagline, description, specs.')
  try {
    const p = await lookup(d, args.product)
    if ('text' in p) return p
    const body = { dryRun: true, textWas: p.textVersion, ...fields }
    const changed = changedOf(await d.ops<{ changed?: unknown } | null>(textPath(p.id), { method: 'PATCH', body }))
    if (changed.length === 0) return { text: 'Nothing would change: the product already has that text.' }
    const after: ProductTextFields = {
      name: fields.name ?? p.name,
      tagline: fields.tagline ?? p.tagline,
      description: fields.description ?? p.description,
      specs: fields.specs ?? p.specs,
    }
    const plan: EditPlan = { kind: 'edit', id: p.id, textWas: p.textVersion, fields }
    return stored(d.previews, plan, formatEdit(p, after, changed), editWarnings(p, after, changed))
  } catch (err) {
    return failure(err)
  }
}

/** Sends a stored edit for real. Null means an answer that says nothing about this edit. */
export async function applyEdit(ops: Ops, plan: EditPlan): Promise<ToolResult | null> {
  const done = await ops<{ applied?: unknown; changed?: unknown } | null>(textPath(plan.id), {
    method: 'PATCH',
    body: { dryRun: false, textWas: plan.textWas, ...plan.fields },
  })
  if (typeof done?.applied !== 'boolean') return null
  if (!done.applied) return { text: `Nothing changed on ${plan.id}: it already had that text.` }
  const fields = Array.isArray(done.changed) ? done.changed.join(', ') : 'text'
  return { text: `Edited ${plan.id} (${fields}). Reload /admin/products before saving this product there.` }
}
