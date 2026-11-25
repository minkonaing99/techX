'use client'

import Link from 'next/link'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Tile } from './tile'
import { StockBadge } from './stock-badge'
import { SaleBadge } from './sale-badge'
import { Price } from './price'
import { HeartButton } from '@/components/wishlist/heart-button'
import { useCart } from '@/lib/cart-store'
import { cn } from '@/lib/utils'
import { isLowStock } from '@/lib/merchandising'
import { shownSalePrice } from '@/lib/pricing'
import type { Product } from '@/lib/types'
import { CATEGORY_NAME } from '@/lib/categories'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const add = useCart((s) => s.add)
  const openCart = useCart((s) => s.open)
  const [pending, setPending] = useState(false)
  const stockQty = product.stockQty ?? (product.inStock ? 10 : 0)
  const isOut = stockQty <= 0

  async function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    if (pending) return
    setPending(true)
    const result = await add(product.id, 1)
    setPending(false)
    if (result.ok) {
      toast(`Added - ${product.name}`, {
        action: { label: 'View cart', onClick: openCart },
      })
    } else {
      toast.error(result.message)
    }
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2 }}
      className="group"
    >
      <Link href={`/product/${product.slug}`} className="block focus:outline-none">
        <div className="relative">
          <Tile
            product={product}
            ratio="square"
            showLabel={false}
            className={isOut ? 'opacity-55 saturate-50' : undefined}
          />
          {isOut && (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-pill)] bg-ink/85 px-5 py-2 text-[13px] font-medium uppercase tracking-[0.14em] text-cream shadow-sm md:text-[14px]">
              Sold out
            </span>
          )}
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="eyebrow">{CATEGORY_NAME[product.category]}</div>
              {isLowStock(product) && (
                <StockBadge
                  stockQty={stockQty}
                  lowStockThreshold={product.lowStockThreshold}
                  size="sm"
                />
              )}
            </div>
            <h3 className="mt-1 font-display text-[18px] leading-tight text-ink">{product.name}</h3>
            <p className="mt-1 text-[13px] text-muted line-clamp-1">{product.tagline}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* Sold out: no badge, no was/now pair, just the full price, muted. */}
            <SaleBadge priceMmk={product.price} salePriceMmk={shownSalePrice(product)} size="sm" />
            <Price
              priceMmk={product.price}
              salePriceMmk={shownSalePrice(product)}
              className={isOut ? 'text-muted' : undefined}
            />
            {isOut ? (
              // Save it for later instead of a dead button. The card is a link,
              // so the click must not carry on to the product page.
              <span onClick={(e) => e.preventDefault()}>
                <HeartButton productId={product.id} productName={product.name} size="sm" />
              </span>
            ) : (
              <button
                onClick={handleAdd}
                disabled={pending}
                aria-busy={pending}
                aria-label={`Add ${product.name} to cart`}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-cream transition-colors hover:bg-accent',
                  pending && 'cursor-wait opacity-70',
                )}
              >
                <Plus size={16} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      </Link>
    </motion.article>
  )
}
