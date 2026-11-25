import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { divisions } from '@/db/schema/divisions'
import type { DivisionFee } from '@/components/pages/shipping'

/** Deliverable divisions with their fee, for the shipping page. */
export async function getDeliveryFees(): Promise<DivisionFee[]> {
  const rows = await db
    .select()
    .from(divisions)
    .where(eq(divisions.isBlocked, false))
    .orderBy(asc(divisions.sortOrder))

  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    deliveryFeeMmk: d.deliveryFeeMmk,
    codAllowed: d.codAllowed,
  }))
}

/** Divisions no courier serves yet, by name, for the shipping and product pages. */
export async function getUncoveredDivisions(): Promise<string[]> {
  const rows = await db
    .select({ name: divisions.name })
    .from(divisions)
    .where(eq(divisions.isBlocked, true))
    .orderBy(asc(divisions.sortOrder))
  return rows.map((d) => d.name)
}
