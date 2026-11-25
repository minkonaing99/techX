import { Hero } from '@/components/home/hero'
import { Stats } from '@/components/home/stats'
import { ProductGrid } from '@/components/home/product-grid'
import { Why } from '@/components/home/why'
import { ContactBanner } from '@/components/home/contact-banner'
import { getAllProducts, getFeaturedProducts } from '@/lib/catalog'
import { rankForShowcase } from '@/lib/merchandising'
import { getSetting } from '@/lib/site-settings'
import { SITE } from '@/lib/site-info'
import { whyMediaFromKey } from '@/lib/why-media'
import type { Product } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * A different featured product each visit for the Why showcase. It used to
 * pin a hardcoded slug, so deactivating that product made the section vanish.
 */
function pickRotating(pool: readonly Product[]): Product | undefined {
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Promo surfaces only advertise what a customer can actually buy today.
 * `getAllProducts` already drops inactive rows; this drops sold-out ones, so
 * setting stock to 0 in admin pulls a product out of the hero and banners
 * without deactivating it or breaking its product page.
 */
function sellable(products: readonly Product[]): readonly Product[] {
  return products.filter((p) => p.inStock)
}

export default async function HomePage() {
  const [featured, all, whyImageKey] = await Promise.all([
    getFeaturedProducts(),
    getAllProducts(),
    getSetting('why_image'),
  ])

  const inStockFeatured = sellable(featured)
  const inStockAll = sellable(all)
  // Prefer featured + in stock; widen only if that leaves nothing to show.
  const pool =
    inStockFeatured.length > 0 ? inStockFeatured : inStockAll.length > 0 ? inStockAll : all
  const showcase = pickRotating(pool)

  const gridProducts = rankForShowcase(all).slice(0, 6)
  const whyMedia = whyMediaFromKey(whyImageKey)

  return (
    <div className="flex h-full flex-col">
      <Hero featured={inStockFeatured.length > 0 ? inStockFeatured : featured} />
      <Stats />
      {gridProducts.length > 0 && <ProductGrid products={gridProducts} />}
      <Why showcase={showcase} media={whyMedia} />
      <ContactBanner telegram={SITE.telegram} facebook={SITE.facebook} />
    </div>
  )
}
