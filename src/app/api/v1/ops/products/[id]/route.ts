import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { fail, ok } from '@/lib/api-response'
import { PRODUCT_ID_RE } from '@/lib/ids'
import { noStore, requireOpsToken } from '@/lib/ops-auth'
import { line, prose, specsSchema } from '@/lib/ops-text'
import { editProductText, readProductText } from '@/lib/product-edit'
import { TEXT_VERSION_RE } from '@/lib/product-text'
import { clientIp } from '@/lib/rate-limit'
import { sendTelegram } from '@/lib/telegram'

/** A full Burmese description and 40 specs fit well inside this; refused before the body is read. */
const MAX_BODY_BYTES = 100_000

/**
 * Text only, and strict: a slug, category or visibility flag is a 400, never
 * silently dropped. Only the fields sent are checked, so old admin text with a
 * character ops would refuse does not block an edit to another field.
 */
const editSchema = z
  .object({
    dryRun: z.boolean(),
    textWas: z.string().regex(TEXT_VERSION_RE, 'textWas must be the textVersion from GET.'),
    name: line(120).optional(),
    tagline: line(200).optional(),
    description: prose(8000).optional(),
    specs: specsSchema.optional(),
  })
  .strict()
  .refine(
    (b) => b.name !== undefined || b.tagline !== undefined || b.description !== undefined || b.specs !== undefined,
    'Send at least one of name, tagline, description, specs.',
  )

type Ctx = { params: Promise<{ id: string }> }

/** The full text of one product, with the fingerprint an edit must send back. */
export async function GET(req: Request, { params }: Ctx): Promise<NextResponse> {
  const denied = requireOpsToken(req)
  if (denied) return denied
  const { id } = await params
  if (!PRODUCT_ID_RE.test(id)) return fail('VALIDATION_ERROR', 'Invalid id.', 400)

  const p = await readProductText(id)
  if (!p) return fail('NOT_FOUND', `No such product: ${id}.`, 404)
  return noStore(
    ok({
      id: p.id,
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      specs: p.specs.map((s) => ({ label: s.label, value: s.value })),
      isActive: p.isActive,
      hasPhotos: p.hasPhotos,
      textVersion: p.textVersion,
    }),
  )
}

/**
 * Edits a product's name, tagline, description or specs. Lands only over the
 * text it was previewed against (`textWas`), so an admin save or another edit
 * since the preview gets 409 instead of being overwritten. The slug never changes.
 */
export async function PATCH(req: Request, { params }: Ctx): Promise<NextResponse> {
  const denied = requireOpsToken(req)
  if (denied) return denied
  const { id } = await params
  if (!PRODUCT_ID_RE.test(id)) return fail('VALIDATION_ERROR', 'Invalid id.', 400)
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail('PAYLOAD_TOO_LARGE', 'The product text is too long.', 413)
  }

  const parsed = editSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }
  const { dryRun, textWas, ...edit } = parsed.data

  const res = await editProductText(id, textWas, edit, dryRun)
  if (res.status === 'not_found') return fail('NOT_FOUND', `No such product: ${id}.`, 404)
  if (res.status === 'stale') {
    return fail('STALE', 'The product text changed since the preview. Preview again.', 409)
  }
  const { changed, textVersion } = res
  if (dryRun || changed.length === 0) return noStore(ok({ applied: false, changed, textVersion }))

  console.info('[ops] product edited', { ip: clientIp(req), id, fields: changed })
  revalidateTag('products')
  // Fields only, never the text: Telegram is a log the owner skims, not a copy of the catalog.
  // Never awaited: a slow or failed Telegram must not delay or fail a committed write.
  void sendTelegram(`Product text edited from the Mac: ${id} (${changed.join(', ')})`).catch(() => {})
  return noStore(ok({ applied: true, changed, textVersion }))
}
