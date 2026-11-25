'use client'

import Image from 'next/image'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { productPhotoUrl, PHOTO_SLOTS, type PhotoSlot, type Product } from '@/lib/types'
import { Tile } from './tile'
import { cn } from '@/lib/utils'

interface GalleryProps {
  product: Product
}

export function Gallery({ product }: GalleryProps) {
  const [active, setActive] = useState<PhotoSlot>('01')
  const [available, setAvailable] = useState<Set<PhotoSlot>>(() =>
    product.hasPhotos ? new Set<PhotoSlot>(PHOTO_SLOTS) : new Set<PhotoSlot>(),
  )

  function handleError(slot: PhotoSlot) {
    setAvailable((prev) => {
      if (!prev.has(slot)) return prev
      const next = new Set(prev)
      next.delete(slot)
      return next
    })
    if (slot === active) {
      // pick first remaining slot or fall back to '01'
      const remaining = PHOTO_SLOTS.find((s) => s !== slot && available.has(s))
      if (remaining) setActive(remaining)
    }
  }

  const thumbs = PHOTO_SLOTS.filter((s) => available.has(s))

  // No photos at all (DB says so OR every slot 404'd at runtime) → swatch only.
  if (!product.hasPhotos || available.size === 0) {
    return (
      <div>
        <Tile product={product} ratio="square" showLabel={false} priority useThumb={false} />
      </div>
    )
  }

  return (
    <div>
      <motion.div
        key={active}
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="relative aspect-square overflow-hidden rounded-[var(--radius)]"
        style={{ background: product.swatch }}
      >
        <Image
          src={productPhotoUrl(product.slug, `${active}.webp`, product.updatedAt)}
          alt={`${product.name} - view ${active}`}
          fill
          sizes="(min-width: 768px) 50vw, 90vw"
          priority
          className="object-cover"
          onError={() => handleError(active)}
        />
      </motion.div>

      {thumbs.length > 1 && (
        <div className="mt-2 flex gap-2 md:mt-3 md:grid md:grid-cols-4 md:gap-3">
          {PHOTO_SLOTS.map((slot) =>
            available.has(slot) ? (
              <button
                key={slot}
                onClick={() => setActive(slot)}
                aria-label={`Show photo ${slot}`}
                aria-pressed={slot === active}
                className={cn(
                  'relative aspect-square size-14 shrink-0 overflow-hidden rounded-[10px] outline-2 outline-offset-2 transition-all md:size-auto',
                  slot === active
                    ? 'outline-accent'
                    : 'outline-transparent opacity-80 hover:opacity-100',
                )}
                style={{ background: product.swatch }}
              >
                <Image
                  src={productPhotoUrl(product.slug, `${slot}-thumb.webp`, product.updatedAt)}
                  alt=""
                  fill
                  sizes="100px"
                  className="object-cover"
                  onError={() => handleError(slot)}
                />
              </button>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}
