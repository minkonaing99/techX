import Link from 'next/link'
import { ShieldCheck, Truck, Wallet, type LucideIcon } from 'lucide-react'
import type { PurchaseFacts } from '@/lib/purchase-facts'
import { cartAllowsCod } from '@/lib/cod'
import { deliveryLine, paymentLine, warrantyLine } from '@/lib/purchase-info'

interface PurchaseInfoProps {
  facts: PurchaseFacts
  /** The price the page shows, sale included. */
  unitPrice: number
  specs: readonly { label: string; value: string }[]
  /** Monitors are never cash on delivery. */
  category: string
}

interface RowProps {
  icon: LucideIcon
  title: string
  body: string
  link?: { href: string; label: string }
}

function Row({ icon: Icon, title, body, link }: RowProps) {
  return (
    <div className="flex gap-3 py-3.5">
      <Icon size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink" aria-hidden />
      <div>
        <h3 className="text-[14px] font-medium text-ink">{title}</h3>
        <p className="mt-0.5 text-[14px] leading-normal text-ink-soft">{body}</p>
        {link ? (
          <Link
            href={link.href}
            className="mt-1 inline-block text-[13px] text-ink underline underline-offset-4 hover:text-accent"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
    </div>
  )
}

/** Delivery, warranty and payment, next to Add to cart rather than at checkout. */
export function PurchaseInfo({ facts, unitPrice, specs, category }: PurchaseInfoProps) {
  const payment = paymentLine({ ...facts, unitPrice, noCod: !cartAllowsCod([category]) })
  return (
    <div className="mt-6 divide-y divide-line border-y border-line">
      <Row
        icon={Truck}
        title="Delivery"
        body={deliveryLine(facts.range, facts.uncovered)}
        link={{ href: '/shipping', label: 'Shipping' }}
      />
      <Row
        icon={ShieldCheck}
        title="Warranty"
        body={warrantyLine(specs)}
        link={{ href: '/returns', label: 'Returns and warranty' }}
      />
      {payment ? <Row icon={Wallet} title="Payment" body={payment} /> : null}
    </div>
  )
}
