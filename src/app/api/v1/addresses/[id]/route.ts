import { NextResponse } from 'next/server'
import { fail, ok } from '@/lib/api-response'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { addresses } from '@/db/schema/addresses'
import { orders } from '@/db/schema/orders'
import { auth } from '@/lib/auth'
import { UUID_RE } from '@/lib/ids'
import { OPEN_ORDER_STATUSES } from '@/lib/order-status'
import { optionalMapsUrl, optionalTelegram, phoneField } from '@/lib/address-fields'



const patchSchema = z
  .object({
    label: z.string().min(1).max(40),
    recipient: z.string().min(1).max(120),
    phone: phoneField,
    divisionId: z.string().min(1).max(40),
    city: z.string().min(1).max(120),
    township: z.string().min(1).max(120),
    street: z.string().min(1).max(200),
    landmark: z.string().max(200).nullable(),
    isDefault: z.boolean(),
  })
  .partial()
  // Kept outside `.partial()`: these two carry a transform, and making them
  // partial as well would let `undefined` through as "clear the field".
  .and(z.object({ telegramUsername: optionalTelegram, mapsUrl: optionalMapsUrl }).partial())

async function requireSession() {
  const session = await auth()
  return session?.user?.id ?? null
}

/**
 * True when one of the caller's orders still on its way was placed with this
 * address. Only asked after the caller's own update matched, and scoped to
 * their orders, so it says nothing about anyone else's address.
 */
async function onOpenOrder(addressId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.shippingAddressId, addressId),
        eq(orders.userId, userId),
        inArray(orders.status, [...OPEN_ORDER_STATUSES]),
      ),
    )
    .limit(1)
  return Boolean(row)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const userId = await requireSession()
  if (!userId) {
    return fail('UNAUTHENTICATED', 'Sign in required.', 401)
  }
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return fail('VALIDATION_ERROR', 'Invalid id.', 400)
  }
  const raw = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }
  // Every field is optional, so {} parses; the update would then throw.
  if (Object.keys(parsed.data).length === 0) {
    return fail('VALIDATION_ERROR', 'Nothing to change.', 400)
  }
  const [header] = await db
    .update(addresses)
    .set(parsed.data)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
  // Deleted in another tab, or not the caller's: say so rather than "saved".
  if (header.affectedRows === 0) {
    return fail('NOT_FOUND', 'Address not found.', 404)
  }
  // The note is advice; a failed check must not report a save that went through as failed.
  const open = await onOpenOrder(id, userId).catch(() => false)
  return ok({ ok: true, onOpenOrder: open })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const userId = await requireSession()
  if (!userId) {
    return fail('UNAUTHENTICATED', 'Sign in required.', 401)
  }
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return fail('VALIDATION_ERROR', 'Invalid id.', 400)
  }
  // An order placed with it keeps its own copy; the link is set to null.
  await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
  return ok({ ok: true })
}
