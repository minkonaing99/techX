import type { Rating } from '@/lib/catalog'
import { effectiveUnitPrice, shownSalePrice } from '@/lib/pricing'
import { productPhotoUrl, type Product } from '@/lib/types'

/*
 * What a product page tells link previews (Facebook first) and search engines.
 * Shared by the page's metadata and its Product JSON-LD.
 */

/** The hero photo, or the logo for a product without photos. May be relative. */
export function productImageUrl(p: Product): string {
  return p.hasPhotos ? productPhotoUrl(p.slug, '01.webp', p.updatedAt) : '/logo.png'
}

/** A brand only from a spec that names one: the shop resells, so it never claims its own. */
function brandOf(p: Product): string | undefined {
  return p.specs.find((s) => s.label.trim().toLowerCase() === 'brand')?.value.trim() || undefined
}

/**
 * schema.org Product for Google. Built by hand with absolute URLs: JSON-LD gets
 * no `metadataBase`. The logo is not a product image, so a product without
 * photos has no `image`; a rating appears only once there are approved reviews.
 */
export function productJsonLd(
  p: Product,
  rating: Rating | undefined,
  origin: string,
): Record<string, unknown> {
  const url = `${origin}/product/${p.slug}`
  const brand = brandOf(p)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.description || p.tagline,
    sku: p.slug,
    url,
    ...(p.hasPhotos ? { image: [new URL(productImageUrl(p), `${origin}/`).href] } : {}),
    ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
    offers: {
      '@type': 'Offer',
      price: effectiveUnitPrice(p.price, shownSalePrice(p)),
      priceCurrency: 'MMK',
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url,
    },
    ...(rating && rating.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Math.round(rating.avg * 10) / 10,
            reviewCount: rating.count,
          },
        }
      : {}),
  }
}

/**
 * JSON for an inline `<script type="application/ld+json">`. The HTML parser ends
 * the element at `</script` whatever its type, and names and descriptions are
 * admin-typed, so every `<` is escaped; JSON.parse still reads the same text.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
