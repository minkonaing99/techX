/**
 * One answer to "can this line be ordered", for every surface that has to ask.
 *
 * The question used to be asked in pieces and in different words: the add route
 * checked `stockQty <= 0`, its sibling PATCH checked nothing at all, the order
 * route compared quantities, and `isActive` was looked at when adding and never
 * again. Naming the rule once is what stops those drifting apart.
 *
 * Structural on purpose - `CartLine` is declared separately either side of the
 * server/client boundary, and both shapes satisfy this without either importing
 * the other.
 */

export interface AvailabilityLine {
  productId: string
  qty: number
  product: {
    stockQty: number
    isActive: boolean
  }
}

export type LineProblem =
  /** Retired in /admin. Nothing to do but take it out of the cart. */
  | { kind: 'unavailable' }
  /** Sold out entirely. */
  | { kind: 'out_of_stock' }
  /** Some left, fewer than asked for. `available` is what can still be had. */
  | { kind: 'insufficient'; available: number }

export interface UnorderableLine {
  productId: string
  problem: LineProblem
}

/** The reason this line cannot be ordered, or null when it can. */
export function lineProblem(line: AvailabilityLine): LineProblem | null {
  // Retired first: it is the reason that no restock can fix, so it is the one
  // worth telling the shopper about when both are true.
  if (!line.product.isActive) return { kind: 'unavailable' }
  if (line.product.stockQty <= 0) return { kind: 'out_of_stock' }
  if (line.product.stockQty < line.qty) {
    return { kind: 'insufficient', available: line.product.stockQty }
  }
  return null
}

/** Every line that cannot be ordered, in cart order. */
export function unorderableLines(lines: readonly AvailabilityLine[]): UnorderableLine[] {
  return lines.flatMap((line) => {
    const problem = lineProblem(line)
    return problem ? [{ productId: line.productId, problem }] : []
  })
}

/** True when the whole cart can go through. An empty cart cannot. */
export function canOrderCart(lines: readonly AvailabilityLine[]): boolean {
  return lines.length > 0 && lines.every((line) => lineProblem(line) === null)
}

/**
 * What a client branches on, kept apart from what a person reads. The order
 * route used to answer `OUT_OF_STOCK:<productId>` in the `message` field and
 * the checkout form showed that string to the customer.
 */
export function problemCode(problem: LineProblem): string {
  switch (problem.kind) {
    case 'unavailable':
      return 'UNAVAILABLE'
    case 'out_of_stock':
      return 'OUT_OF_STOCK'
    case 'insufficient':
      return 'INSUFFICIENT_STOCK'
  }
}

export function problemMessage(problem: LineProblem): string {
  switch (problem.kind) {
    case 'unavailable':
      return 'No longer available'
    case 'out_of_stock':
      return 'Sold out'
    case 'insufficient':
      return `Only ${problem.available} left`
  }
}

/**
 * A sentence for the customer. Names the product while there is only one to
 * name, and counts them once naming them all would be a paragraph.
 */
export function unorderableMessage(
  lines: readonly (AvailabilityLine & { product: { name: string } })[],
  unorderable: readonly UnorderableLine[],
): string {
  if (unorderable.length > 1) {
    return `${unorderable.length} items in your cart are no longer available.`
  }
  const [only] = unorderable
  if (!only) return 'Your cart is no longer available.'
  const name = lines.find((l) => l.productId === only.productId)?.product.name ?? 'An item'
  switch (only.problem.kind) {
    case 'unavailable':
      return `${name} is no longer available.`
    case 'out_of_stock':
      return `${name} just sold out.`
    case 'insufficient':
      return `Only ${only.problem.available} of ${name} left.`
  }
}
