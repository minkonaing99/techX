'use client'

import { formatMmk } from '@/lib/money'
import { useCart } from '@/lib/cart-store'
import { lineProblem } from '@/lib/cart-availability'
import { LineProblemBadge } from '@/components/cart/line-problem-badge'
import { Price } from '@/components/product/price'
import { cn } from '@/lib/utils'
import type { CartLine } from '@/lib/cart-session'
import type { DivisionLite } from './checkout-model'

interface CheckoutSummaryProps {
  lines: CartLine[]
  subtotal: number
  savings: number
  division: DivisionLite | undefined
  deliveryFee: number
  total: number
}

export function CheckoutSummary({ lines, subtotal, savings, division, deliveryFee, total }: CheckoutSummaryProps) {
  return (
    <aside className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 md:p-8">
      <h2 className="font-display text-[22px]">Summary</h2>
      <ul className="mt-4 space-y-2">
        {lines.map((l) => (
          <SummaryLineItem key={l.productId} line={l} />
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between text-[13px]">
        <span className="text-ink-soft">Subtotal</span>
        <span className="price text-ink">{formatMmk(subtotal)}</span>
      </div>
      {savings > 0 && (
        <div className="mt-1 flex items-center justify-between text-[13px]">
          <span className="text-ink-soft">You save</span>
          <span className="price text-[var(--color-accent)]">-{formatMmk(savings)}</span>
        </div>
      )}
      <div className="mt-1 flex items-center justify-between text-[13px]">
        <span className="text-ink-soft">
          Delivery{division ? ` · ${division.name}` : ''}
        </span>
        <span className="price text-ink">
          {division ? formatMmk(deliveryFee) : '-'}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-4">
        <span className="font-display text-[18px]">Total</span>
        <span className="price font-display text-[20px]">{formatMmk(total)}</span>
      </div>
    </aside>
  )
}

function SummaryLineItem({ line: l }: { line: CartLine }) {
  const setQty = useCart((s) => s.setQty)
  const removeLine = useCart((s) => s.remove)
  const problem = lineProblem(l)
  return (
    <li className="text-[13px]">
      <div className="flex items-center justify-between">
        <span className={cn('text-ink-soft', problem && 'text-muted line-through')}>
          {l.qty} × {l.product.name}
        </span>
        <Price
          priceMmk={l.product.priceMmk * l.qty}
          salePriceMmk={
            l.product.salePriceMmk === null ? null : l.product.salePriceMmk * l.qty
          }
          size="text-[13px]"
        />
      </div>
      {problem && (
        /*
         * Fixed here rather than back on /cart. This form holds a
         * half-typed address, and sending someone away to fix a line
         * loses it.
         */
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <LineProblemBadge problem={problem} />
          {problem.kind === 'insufficient' && (
            <button
              type="button"
              onClick={() => setQty(l.productId, problem.available)}
              className="text-[12px] font-medium text-accent underline underline-offset-4"
            >
              Reduce to {problem.available}
            </button>
          )}
          <button
            type="button"
            onClick={() => removeLine(l.productId)}
            className="text-[12px] font-medium text-muted underline underline-offset-4 hover:text-error"
          >
            Remove
          </button>
        </div>
      )}
    </li>
  )
}
