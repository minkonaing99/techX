/**
 * The largest order, delivery included, that may be paid in cash on delivery.
 * Shared by the product page, checkout and the order route, so the promise and
 * the check cannot drift apart.
 */
export const COD_CAP_MMK = 500_000

/** Categories never sold cash on delivery: monitors are bulky, insured parcels. */
export const NO_COD_CATEGORIES: readonly string[] = ['monitors']

export const NO_COD_MESSAGE = 'Cash on delivery is not offered for monitors.'

/** Whether a cart with products in these categories may be paid on delivery. */
export function cartAllowsCod(categories: readonly (string | undefined)[]): boolean {
  return !categories.some((c) => c !== undefined && NO_COD_CATEGORIES.includes(c))
}
