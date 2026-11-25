'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useCart, useCartSubtotal } from '@/lib/cart-store'
import { formatMmk } from '@/lib/money'
import { cartSavings } from '@/lib/pricing'
import { Price } from '@/components/product/price'
import { productPhotoUrl } from '@/lib/types'
import { canOrderCart, lineProblem } from '@/lib/cart-availability'
import { LineProblemBadge } from '@/components/cart/line-problem-badge'
import { cn } from '@/lib/utils'
import type { DeliveryRange } from '@/lib/delivery-range'

/** Null when the fees could not be read; the wording still says when delivery is added. */
export function CartView({ delivery }: { delivery: DeliveryRange | null }) {
  const items = useCart((s) => s.items)
  const setQty = useCart((s) => s.setQty)
  const remove = useCart((s) => s.remove)
  const subtotal = useCartSubtotal()
  const savings = cartSavings(items)
  const canCheckout = canOrderCart(items)

  return (
    <section className="container-prose py-16 md:py-20">
      <div className="eyebrow">Cart</div>
      <h1 className="mt-3 font-display text-[40px] leading-[1.05] text-ink md:text-[52px]">
        Your selection.
      </h1>

      {items.length === 0 ? (
        <div className="mt-12 rounded-[var(--radius-lg)] border border-line bg-surface px-6 py-20 text-center">
          <p className="font-display text-[26px]">Your cart is empty.</p>
          <p className="mx-auto mt-2 max-w-[36ch] text-[14px] text-muted">
            Browse the shop to find something worth carrying home.
          </p>
          <Link
            href="/shop"
            className="mt-6 inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-ink px-6 py-3 text-[14px] font-medium text-cream transition-colors hover:bg-accent"
          >
            Visit the shop
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 items-start gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-14">
          <ul className="divide-y divide-line border-y border-line">
            {items.map((item) => {
              const p = item.product
              const problem = lineProblem(item)
              return (
                <li key={p.id} className="flex gap-5 py-6">
                  <div
                    className={cn(
                      'relative h-[120px] w-[120px] shrink-0 overflow-hidden rounded-[var(--radius)]',
                      problem && 'opacity-45 grayscale',
                    )}
                    style={{ background: p.swatch }}
                  >
                    {p.hasPhotos && (
                      <Image
                        src={productPhotoUrl(p.slug, '01.webp', p.updatedAt)}
                        alt={p.name}
                        fill
                        sizes="120px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <Link
                        href={`/product/${p.slug}`}
                        className="font-display text-[20px] leading-tight hover:text-accent"
                      >
                        {p.name}
                      </Link>
                      <Price
                        priceMmk={p.priceMmk * item.qty}
                        salePriceMmk={p.salePriceMmk === null ? null : p.salePriceMmk * item.qty}
                        size="text-[16px]"
                      />
                    </div>
                    {problem ? (
                      <LineProblemBadge problem={problem} className="mt-1.5 self-start" />
                    ) : (
                      <p className="mt-1 text-[13px] text-muted">{p.tagline}</p>
                    )}

                    <div className="mt-auto flex items-center justify-between pt-4">
                      <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-cream px-1.5 py-1">
                        <button
                          onClick={() => setQty(p.id, item.qty - 1)}
                          aria-label="Decrease qty"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-soft hover:bg-line"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="min-w-[1.5ch] text-center text-[14px] tabular-nums">
                          {item.qty}
                        </span>
                        {/*
                          Capped: the route refuses a quantity above stock, so
                          an uncapped "+" is a live-looking button that only
                          ever answers with an error.
                        */}
                        <button
                          onClick={() => setQty(p.id, item.qty + 1)}
                          disabled={item.qty >= p.stockQty}
                          aria-label="Increase qty"
                          aria-describedby={item.qty === p.stockQty ? `stock-${p.id}` : undefined}
                          className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-soft',
                            item.qty >= p.stockQty
                              ? 'cursor-not-allowed opacity-40'
                              : 'hover:bg-line',
                          )}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      {/* Exactly at stock only: above it, the line's own badge already says so. */}
                      {item.qty === p.stockQty && p.stockQty > 0 && (
                        <span id={`stock-${p.id}`} className="text-[12px] text-muted">
                          Only {p.stockQty} available
                        </span>
                      )}
                      <button
                        onClick={() => remove(p.id)}
                        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-error"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          <aside className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 md:p-8">
            <h2 className="font-display text-[22px]">Summary</h2>
            <dl className="mt-5 space-y-3 text-[14px]">
              <div className="flex items-center justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="price text-ink">{formatMmk(subtotal)}</dd>
              </div>
              {savings > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted">You save</dt>
                  <dd className="price text-[var(--color-accent)]">-{formatMmk(savings)}</dd>
                </div>
              )}
              {/* No total here: the fee depends on the division, which checkout asks
                  for, and it is shown there before anything is paid. */}
              {delivery && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted">Delivery</dt>
                  <dd className="price text-ink">
                    {delivery.min === delivery.max
                      ? formatMmk(delivery.min)
                      : `${formatMmk(delivery.min)} to ${formatMmk(delivery.max)}`}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-2 text-[12px] text-muted">
              {delivery ? 'By division, added at checkout before you pay.' : 'Added at checkout before you pay.'}
            </p>

            {/*
              Blocked here rather than at checkout. They have to fix it either
              way, and stopping them now saves typing an address into a form
              that is going to refuse them.
            */}
            {canCheckout ? (
              <Link
                href="/checkout"
                className="mt-6 inline-flex w-full items-center justify-center rounded-[var(--radius-pill)] bg-ink py-3.5 text-[14px] font-medium text-cream transition-colors hover:bg-accent"
              >
                Checkout
              </Link>
            ) : (
              <>
                <span
                  aria-disabled
                  className="mt-6 inline-flex w-full cursor-not-allowed items-center justify-center rounded-[var(--radius-pill)] bg-line py-3.5 text-[14px] font-medium text-muted"
                >
                  Checkout
                </span>
                <p className="mt-2 text-center text-[12px] text-[var(--color-error)]">
                  Remove or reduce the marked items to continue.
                </p>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  )
}
