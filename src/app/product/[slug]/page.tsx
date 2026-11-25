import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Gallery } from '@/components/product/gallery'
import { ProductCard } from '@/components/product/card'
import { AddToCartButton } from '@/components/product/add-to-cart-button'
import { StockBadge } from '@/components/product/stock-badge'
import { SaleBadge } from '@/components/product/sale-badge'
import { Price } from '@/components/product/price'
import { HeartButton } from '@/components/wishlist/heart-button'
import { ReviewBlock } from '@/components/reviews/review-block'
import { ComparePicker } from '@/components/compare/compare-picker'
import { PurchaseInfo } from '@/components/product/purchase-info'
import { ProductDescription } from '@/components/product/product-description'
import {
  getCategoryById,
  getProductBySlug,
  getProductsByCategory,
  getProductRatings,
  getRelatedProducts,
} from '@/lib/catalog'
import { jsonLdScript, productImageUrl, productJsonLd } from '@/lib/product-seo'
import { effectiveUnitPrice, shownSalePrice } from '@/lib/pricing'
import { getPurchaseFacts } from '@/lib/purchase-facts'

export const dynamic = 'force-dynamic'

/**
 * The JSON-LD's origin, matching `metadataBase` in the layout (and the sitemap),
 * so its URLs and the canonical/OG tags always name the same host.
 */
const ORIGIN = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://techx-store.online').origin

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) return { title: 'Not found' }
  const image = productImageUrl(product)
  const url = `/product/${product.slug}`
  // A page's openGraph and twitter replace the layout's whole object, so type,
  // siteName and card are repeated. og:type stays 'website': Next has no
  // 'product', and Google reads the product from the JSON-LD below.
  return {
    title: product.name,
    description: product.tagline,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: 'TechX',
      title: product.name,
      description: product.tagline,
      url,
      images: [{ url: image, alt: product.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description: product.tagline,
      images: [image],
    },
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) notFound()

  const [category, related, siblings, ratings, facts] = await Promise.all([
    getCategoryById(product.category),
    getRelatedProducts(slug, 3),
    getProductsByCategory(product.category),
    getProductRatings([product.id]),
    // Shown with the buttons, but never worth losing the product page over.
    getPurchaseFacts().catch((err: unknown) => {
      console.warn('[product] purchase info unreadable', err instanceof Error ? err.message : 'unknown error')
      return null
    }),
  ])

  const comparable = siblings.filter((p) => p.slug !== slug)

  return (
    <article className="container-prose pt-6 pb-10 md:py-16">
      {/* A data block, never executed, so the CSP nonce does not apply. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(productJsonLd(product, ratings[product.id], ORIGIN)),
        }}
      />
      <Link
        href="/shop"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-accent"
      >
        <ArrowLeft size={14} />
        Back to shop
      </Link>

      <div className="mt-4 grid items-start gap-6 md:mt-6 md:grid-cols-[1.1fr_1fr] md:gap-14">
        <div className="md:sticky md:top-24">
          <Gallery product={product} />
        </div>

        <div>
          <div className="eyebrow">{category?.name}</div>
          <h1 className="mt-2 font-display text-[32px] leading-[1.05] text-ink sm:text-[40px] md:mt-3 md:text-[52px]">
            {product.name}
          </h1>
          {/* Under the price on a phone, so price and stock reach the first screen. */}
          <p className="mt-3 hidden text-[16px] text-ink-soft md:block">{product.tagline}</p>

          <div className="mt-4 flex flex-wrap items-center gap-4 border-y border-line py-4 md:mt-6 md:py-5">
            <Price
              priceMmk={product.price}
              salePriceMmk={shownSalePrice(product)}
              size="font-display text-[28px]"
            />
            <SaleBadge priceMmk={product.price} salePriceMmk={shownSalePrice(product)} />
            <StockBadge
              stockQty={product.stockQty ?? (product.inStock ? 10 : 0)}
              lowStockThreshold={product.lowStockThreshold ?? 3}
            />
          </div>
          <p className="mt-3 text-[15px] text-ink-soft md:hidden">{product.tagline}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3 md:mt-6">
            <AddToCartButton
              productId={product.id}
              productName={product.name}
              disabled={(product.stockQty ?? 0) <= 0}
            />
            <HeartButton productId={product.id} productName={product.name} />
            <ComparePicker current={product} others={comparable} label="Compare" />
            <Link
              href="/cart"
              className="inline-flex items-center justify-center rounded-[var(--radius-pill)] border border-line bg-cream px-6 py-3.5 text-[14px] font-medium text-ink transition-colors hover:border-ink/40"
            >
              View cart
            </Link>
          </div>

          {facts ? (
            <PurchaseInfo
              facts={facts}
              unitPrice={effectiveUnitPrice(product.price, shownSalePrice(product))}
              specs={product.specs}
              category={product.category}
            />
          ) : null}

          <div className="mt-10">
            <h2 className="font-display text-[22px] text-ink">About this product</h2>
            <ProductDescription text={product.description} />
          </div>

          <div className="mt-10">
            <h2 className="font-display text-[22px] text-ink">Specifications</h2>
            <dl className="mt-4 divide-y divide-line border-y border-line">
              {product.specs.map((s) => (
                <div key={s.label} className="grid grid-cols-[140px_1fr] gap-4 py-3.5">
                  <dt className="text-[13px] tracking-[0.06em] uppercase text-muted">{s.label}</dt>
                  <dd className="text-[14px] text-ink">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

        </div>
      </div>

      <ReviewBlock slug={product.slug} />

      {related.length > 0 && (
        <section className="mt-20 border-t border-line pt-12">
          <div className="eyebrow">Also from this batch</div>
          <h2 className="mt-3 font-display text-[28px] text-ink md:text-[36px]">
            You might also like.
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
