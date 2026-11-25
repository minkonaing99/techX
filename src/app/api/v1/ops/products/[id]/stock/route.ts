import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { fail, ok } from '@/lib/api-response'
import { db } from '@/db'
import { products } from '@/db/schema/products'
import { PRODUCT_ID_RE } from '@/lib/ids'
import { noStore, requireOpsToken } from '@/lib/ops-auth'
import { clientIp } from '@/lib/rate-limit'
import { restock } from '@/lib/stock'
import { sendTelegram } from '@/lib/telegram'

/** The admin form's ceiling, so ops writes cannot pass it. */
const MAX_STOCK = 100_000
/** One delivery. Larger is more likely a typo than a shipment. */
const MAX_ADD = 10_000

const bodySchema = z
  .object({
    dryRun: z.boolean(),
    add: z.number().int().min(1).max(MAX_ADD),
    stockWas: z.number().int().min(0).max(MAX_STOCK),
  })
  .refine((b) => b.stockWas + b.add <= MAX_STOCK, `Stock may be at most ${MAX_STOCK}.`)

async function currentStock(id: string): Promise<number | null> {
  const [row] = await db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, id)).limit(1)
  return row ? row.stockQty : null
}

function stale(stockQty: number): NextResponse {
  return fail('STALE', `Stock changed to ${stockQty} since the preview. Preview again.`, 409, { stockQty })
}

/**
 * Adds a delivery to one product's stock. The change names the stock it
 * expects to add to and lands only over it, so a repeated apply - or an order
 * taken since the preview - gets 409 instead of a wrong total.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireOpsToken(req)
  if (denied) return denied
  const { id } = await params
  if (!PRODUCT_ID_RE.test(id)) return fail('VALIDATION_ERROR', 'Invalid id.', 400)

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }
  const { dryRun, add, stockWas } = parsed.data

  const now = await currentStock(id)
  if (now === null) return fail('NOT_FOUND', `No such product: ${id}.`, 404)
  if (now !== stockWas) return stale(now)
  const stockQty = stockWas + add
  if (dryRun) return noStore(ok({ applied: false, stockQty }))

  const added = await db.transaction((tx) => restock(tx, id, add, stockWas))
  if (!added) {
    const after = await currentStock(id)
    return after === null ? fail('NOT_FOUND', `No such product: ${id}.`, 404) : stale(after)
  }

  console.info('[ops] stock added', { ip: clientIp(req), id, was: stockWas, add, now: stockQty })
  revalidateTag('products')
  // Never awaited: a slow or failed Telegram must not delay or fail a committed write.
  void sendTelegram(`Stock added from the Mac:\n${id}: stock ${stockWas} -> ${stockQty} (+${add})`).catch(() => {})
  return noStore(ok({ applied: true, stockQty }))
}
