import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { fail, ok } from '@/lib/api-response'
import sharp from 'sharp'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { paymentMethods } from '@/db/schema/payment-methods'
import { requireAdmin } from '@/lib/admin-guard'
import { r2PublicUrl } from '@/lib/cdn'
import { deletePublic, putPublic } from '@/lib/r2'

const ID_RE = /^[a-z0-9_]+$/i
const MAX_BYTES = 4 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * Content-addressed, like the Why image. `putPublic` serves public objects
 * `max-age=31536000, immutable`, so a replacement written to a fixed key would
 * keep showing the old QR at the CDN edge and in browsers - and a customer
 * would pay an account the owner no longer uses. A new image gets a new URL.
 */
function qrKey(methodId: string, bytes: Buffer): string {
  return `payment-qr/${methodId}-${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.webp`
}

/**
 * This method's QR object: today's hashed key, or the fixed key used before it.
 * An exact match, not a prefix: the column is admin-writable through PATCH, and
 * a prefix would let `payment-qr/<id>-/../products/...` through to a delete.
 * `methodId` already passed ID_RE, so it is safe inside the pattern.
 */
function isOwnQr(methodId: string, key: string): boolean {
  return new RegExp(`^payment-qr/${methodId}(-[0-9a-f]{16})?\\.webp$`).test(key)
}

interface StoredQr {
  /** The row's own id. The lookup is case-insensitive, so `KBZ_PAY` finds `kbz_pay`. */
  id: string
  /** The stored QR key, legacy `/payment-qr/...` disk paths read as R2 keys. */
  key: string | null
}

/** Undefined: no such method. */
async function storedQr(methodId: string): Promise<StoredQr | undefined> {
  const [row] = await db
    .select({ id: paymentMethods.id, qrImageUrl: paymentMethods.qrImageUrl })
    .from(paymentMethods)
    .where(eq(paymentMethods.id, methodId))
    .limit(1)
  if (!row) return undefined
  return { id: row.id, key: row.qrImageUrl ? row.qrImageUrl.replace(/^\//, '') : null }
}

/** Best-effort: a failed delete leaves an orphan object, which is harmless. */
async function deleteOwnQr(methodId: string, key: string | null): Promise<void> {
  if (!key || !isOwnQr(methodId, key)) return
  await deletePublic(key).catch(() => {})
}

export async function POST(req: Request): Promise<NextResponse> {
  const denied = await requireAdmin()
  if (denied) return denied

  const form = await req.formData().catch(() => null)
  if (!form) return fail('VALIDATION_ERROR', 'Invalid form data.', 400)

  const methodId = form.get('methodId')
  const file = form.get('qr')
  if (typeof methodId !== 'string' || !ID_RE.test(methodId)) {
    return fail('VALIDATION_ERROR', 'Invalid method id.', 400)
  }
  if (!(file instanceof File)) return fail('VALIDATION_ERROR', 'Missing QR file.', 400)
  if (file.size > MAX_BYTES) return fail('VALIDATION_ERROR', 'File over 4 MB.', 413)
  if (!ALLOWED_MIME.has(file.type)) {
    return fail('VALIDATION_ERROR', 'Use JPG, PNG, or WEBP.', 415)
  }

  const stored = await storedQr(methodId)
  if (!stored) return fail('NOT_FOUND', 'Payment method not found.', 404)

  const buffer = Buffer.from(await file.arrayBuffer())
  let processed: Buffer
  try {
    processed = await sharp(buffer)
      .rotate()
      .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 92 })
      .toBuffer()
  } catch {
    return fail('VALIDATION_ERROR', 'Could not read image.', 400)
  }

  const key = qrKey(stored.id, processed)

  try {
    await putPublic(key, processed, 'image/webp')
  } catch {
    return fail('UPSTREAM_ERROR', 'Could not store QR.', 502)
  }

  // Point the row at the new object before deleting the old one, so a failure
  // between the two leaves an orphan rather than a method aimed at nothing.
  await db.update(paymentMethods).set({ qrImageUrl: key }).where(eq(paymentMethods.id, stored.id))
  if (stored.key !== key) await deleteOwnQr(stored.id, stored.key)

  return ok({ qrImageUrl: r2PublicUrl(key) })
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const denied = await requireAdmin()
  if (denied) return denied

  const url = new URL(req.url)
  const methodId = url.searchParams.get('methodId') ?? ''
  if (!ID_RE.test(methodId)) {
    return fail('VALIDATION_ERROR', 'Invalid method id.', 400)
  }

  const stored = await storedQr(methodId)
  if (!stored) return fail('NOT_FOUND', 'Payment method not found.', 404)

  await db.update(paymentMethods).set({ qrImageUrl: null }).where(eq(paymentMethods.id, stored.id))
  await deleteOwnQr(stored.id, stored.key)

  return ok({ ok: true })
}
