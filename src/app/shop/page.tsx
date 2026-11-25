import { Suspense } from 'react'
import { GridControls } from '@/components/shop/grid-controls'
import { ShopGridSkeleton } from '@/components/shop/grid-skeleton'
import { getAllProducts } from '@/lib/catalog'

export const metadata = {
  title: 'Shop',
  description: 'Every product in the shop. Keyboards, mice, monitors, audio, accessories.',
  alternates: { canonical: '/shop' },
}

export const dynamic = 'force-dynamic'

/**
 * The only part of this page that waits on the database, split out so the
 * heading paints immediately and the catalog streams in behind it.
 */
async function ShopGrid() {
  const products = await getAllProducts()
  return <GridControls all={products} />
}

export default function ShopPage() {
  return (
    <section className="container-prose pt-8 pb-16 md:py-20">
      <div className="eyebrow">Shop</div>
      <h1 className="mt-2 font-display text-[32px] leading-[1.05] text-ink sm:mt-3 sm:text-[40px] md:text-[56px]">
        Every product in the shop.
      </h1>
      {/* Hidden on phones, where it pushed the first price below the fold. */}
      <p className="mt-4 hidden max-w-[52ch] text-[15px] text-ink-soft sm:block">
        Sorted by what we like best this week. Filter by category to narrow it down.
      </p>

      <div className="mt-6 md:mt-10">
        <Suspense fallback={<ShopGridSkeleton />}>
          <ShopGrid />
        </Suspense>
      </div>
    </section>
  )
}
