import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { fail, ok } from '@/lib/api-response'
import { db } from '@/db'
import { products } from '@/db/schema/products'
import { PRODUCT_ID_RE } from '@/lib/ids'
import { formatMmk } from '@/lib/money'
import { noStore, requireOpsToken } from '@/lib/ops-auth'
import { clientIp } from '@/lib/rate-limit'
import { MAX_PRICE_MMK, changeProblem, type PriceChange } from '@/lib/ops-pricing'
import { sendTelegram } from '@/lib/telegram'

const changeSchema = z.object({
  id: z.string().max(64).regex(PRODUCT_ID_RE),
  priceWas: z.number().int().min(0).max(MAX_PRICE_MMK),
  salePriceWas: z.number().int().min(0).max(MAX_PRICE_MMK).nullable(),
  priceMmk: z.number().int(),
  /** Left out keeps the current sale; `null` ends it. */
  salePriceMmk: z.number().int().min(0).max(MAX_PRICE_MMK).nullable().optional(),
})

const bodySchema = z
  .object({ dryRun: z.boolean(), changes: z.array(changeSchema).min(1).max(500) })
  .refine((b) => new Set(b.changes.map((c) => c.id)).size === b.changes.length, 'Each product may appear once.')

/** Internal transaction-abort signal: a price moved between the read and the write. */
const STALE = 'STALE'
/** 500 changes fit in well under this; refused before the body is read. */
const MAX_BODY_BYTES = 200_000

interface Current {
  id: string
  priceMmk: number
  salePriceMmk: number | null
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function readCurrent(ids: string[]): Promise<Current[]> {
  return db
    .select({ id: products.id, priceMmk: products.priceMmk, salePriceMmk: products.salePriceMmk })
    .from(products)
    .where(inArray(products.id, ids))
}

/** The rows whose price or sale no longer matches what the change expects to replace. */
function staleRows(changes: PriceChange[], current: Current[]): Current[] {
  const now = new Map(current.map((c) => [c.id, c]))
  return changes
    .map((c) => now.get(c.id))
    .filter((row, i): row is Current => {
      const c = changes[i]!
      return !!row && (row.priceMmk !== c.priceWas || row.salePriceMmk !== c.salePriceWas)
    })
}

function stale(rows: Current[]): NextResponse {
  return fail('STALE', 'Prices changed since the preview. Preview again.', 409, { current: rows })
}

function summary(changes: PriceChange[]): string {
  const line = (c: PriceChange) => {
    const sale =
      c.salePriceMmk === c.salePriceWas
        ? ''
        : ` (sale ${c.salePriceWas === null ? 'none' : formatMmk(c.salePriceWas)} -> ${c.salePriceMmk === null ? 'none' : formatMmk(c.salePriceMmk)})`
    return `${c.id}: ${formatMmk(c.priceWas)} -> ${formatMmk(c.priceMmk)}${sale}`
  }
  const shown = changes.slice(0, 10).map(line)
  const more = changes.length > 10 ? [`...and ${changes.length - 10} more`] : []
  return [`Prices changed from the Mac (${changes.length}):`, ...shown, ...more].join('\n')
}

/** Rows per log line: well under the 10,000 characters Node's console prints of one string. */
const AUDIT_ROWS_PER_LINE = 50

/**
 * Every row, unlike the Telegram summary: these lines are the audit trail when
 * Telegram is off, so a large batch is split rather than cut.
 */
function logApplied(req: Request, changes: PriceChange[]): void {
  const rows = changes.map((c) => {
    const sale = c.salePriceMmk === c.salePriceWas ? '' : ` sale ${c.salePriceWas ?? 'none'}->${c.salePriceMmk ?? 'none'}`
    return `${c.id} ${c.priceWas}->${c.priceMmk}${sale}`
  })
  const parts = Math.ceil(rows.length / AUDIT_ROWS_PER_LINE)
  const ip = clientIp(req)
  for (let i = 0; i < parts; i++) {
    const chunk = rows.slice(i * AUDIT_ROWS_PER_LINE, (i + 1) * AUDIT_ROWS_PER_LINE)
    console.info('[ops] prices applied', { ip, count: changes.length, part: `${i + 1}/${parts}`, changes: chunk.join('; ') })
  }
}

/**
 * Applies price changes the owner previewed. Every change names the price and
 * sale it expects to replace, and lands only over exactly those - so a
 * repeated apply, or a price edited meanwhile, gets 409 instead of a double
 * change. All or nothing, in product-id order (the order checkout locks rows).
 */
export async function PATCH(req: Request): Promise<NextResponse> {
  const denied = requireOpsToken(req)
  if (denied) return denied
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail('PAYLOAD_TOO_LARGE', 'Too many changes in one request.', 413)
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }
  const changes: PriceChange[] = parsed.data.changes
    .map((c) => ({ ...c, salePriceMmk: c.salePriceMmk === undefined ? c.salePriceWas : c.salePriceMmk }))
    .sort(byId)
  const problem = changes.map(changeProblem).find((p) => p !== null)
  if (problem) return fail('VALIDATION_ERROR', problem, 400)

  const ids = changes.map((c) => c.id)
  const current = await readCurrent(ids)
  const missing = ids.filter((id) => !current.some((c) => c.id === id))
  if (missing.length > 0) return fail('NOT_FOUND', `No such product: ${missing.join(', ')}.`, 404)
  const moved = staleRows(changes, current)
  if (moved.length > 0) return stale(moved)

  if (parsed.data.dryRun) return noStore(ok({ applied: false, count: changes.length }))

  try {
    await db.transaction(async (tx) => {
      for (const c of changes) {
        const [header] = await tx
          .update(products)
          .set({ priceMmk: c.priceMmk, salePriceMmk: c.salePriceMmk })
          .where(
            and(
              eq(products.id, c.id),
              eq(products.priceMmk, c.priceWas),
              c.salePriceWas === null ? isNull(products.salePriceMmk) : eq(products.salePriceMmk, c.salePriceWas),
            ),
          )
        if (header.affectedRows !== 1) throw new Error(STALE)
      }
    })
  } catch (err) {
    if (err instanceof Error && err.message === STALE) return stale(staleRows(changes, await readCurrent(ids)))
    throw err
  }

  logApplied(req, changes)
  revalidateTag('products')
  // A notification, not part of the change: never awaited, so neither a
  // failure nor a slow Telegram can fail or delay the answer to a committed
  // write (a late answer would leave the owner unsure whether it landed).
  void sendTelegram(summary(changes)).catch(() => {})
  return noStore(ok({ applied: true, count: changes.length }))
}
