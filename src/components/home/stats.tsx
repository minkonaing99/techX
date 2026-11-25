'use client'

import { motion } from 'framer-motion'

const STATS = [
  { value: 'Genuine', label: 'real stock, manufacturer warranty on every product' },
  { value: '2 weeks', label: 'factory fault? we refund or replace it ourselves' },
  { value: 'Most of Myanmar', label: 'delivered from Mandalay, fee by division' },
] as const

export function Stats() {
  return (
    <section className="container-prose border-y border-line py-8 md:py-14">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="grid grid-cols-3 gap-4 sm:gap-10"
      >
        {STATS.map((s) => (
          <div key={s.label} className="flex flex-col items-center text-center">
            <span className="font-display text-[19px] leading-[1.1] tracking-[-0.01em] text-ink sm:text-[28px] md:text-[34px]">
              {s.value}
            </span>
            <span className="mt-1.5 max-w-[24ch] text-[12px] leading-snug text-muted sm:mt-3 sm:text-[13px] sm:leading-relaxed">
              {s.label}
            </span>
          </div>
        ))}
      </motion.div>
    </section>
  )
}
