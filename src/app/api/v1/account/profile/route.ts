import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema/auth'
import { auth } from '@/lib/auth'
import { fail, ok } from '@/lib/api-response'

// The name shows on the account page, on the customer's reviews and in admin.
// Empty clears it. The email is the sign-in and is never changed.
const bodySchema = z.object({
  name: z
    .string()
    // Zero-width characters are dropped, not refused: Burmese keyboards insert them.
    .transform((v) => v.replace(/[\u200b-\u200d\ufeff]/g, ''))
    .pipe(
      z
        .string()
        .trim()
        .max(120, 'Name must be 120 characters or fewer.')
        // Control and text-direction characters: on a public review they would
        // show a reordered or garbled author.
        .refine(
          (v) => !/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(v),
          'Name cannot contain hidden characters.',
        )
        .refine((v) => v === '' || /[\p{L}\p{N}]/u.test(v), 'Name needs at least one letter or number.'),
    ),
})

/** Changes the signed-in customer's own name. */
export async function PATCH(req: Request): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user?.id) {
    return fail('UNAUTHENTICATED', 'Sign in required.', 401)
  }

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body.', 400)
  }

  const name = parsed.data.name || null
  await db.update(users).set({ name }).where(eq(users.id, session.user.id))
  return ok({ name })
}
