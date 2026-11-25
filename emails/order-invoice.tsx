import { Body, Button, Container, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { MethodKind } from '@/lib/order-status'
import * as s from './_styles'
import { BrandHead } from './_head'
import { OrderMeta } from './_meta'
import { OrderRail } from './_rail'
import { ItemTable, type LineItem } from './_items'
import { EmailFooter } from './_footer'

interface OrderInvoiceProps {
  orderId: string
  orderUrl: string
  total: string
  subtotal: string
  deliveryFee: string
  method: string
  kind: MethodKind
  placedAt: string
  updatedAt: string
  items: LineItem[]
}

export function OrderInvoice({
  orderId,
  orderUrl,
  total,
  subtotal,
  deliveryFee,
  method,
  kind,
  placedAt,
  updatedAt,
  items,
}: OrderInvoiceProps) {
  // Confirming a COD order means the shop accepted it; nothing is paid until the courier collects.
  const isCod = kind === 'cod'
  return (
    <Html>
      <BrandHead />
      <Preview>{isCod ? 'Order confirmed - pay on delivery' : 'Payment confirmed - your TechX invoice'}</Preview>
      <Body style={s.body}>
        <Container style={s.shell}>
          <Section style={s.content}>
            <OrderMeta orderId={orderId} note={isCod ? method : `paid via ${method}`} />
            <Heading style={s.display}>
              {isCod ? 'Confirmed. We\u2019re packing.' : 'It\u2019s paid. We\u2019re packing.'}
            </Heading>
            {isCod && <Text style={s.lead}>Pay {total} to the courier when it arrives.</Text>}

            <OrderRail status="confirmed" kind={kind} placedAt={placedAt} updatedAt={updatedAt} />

            <Section style={s.buttonRow}>
              <Button href={orderUrl} style={s.buttonPrimary}>
                Track this order
              </Button>
            </Section>

            <ItemTable
              items={items}
              subtotal={subtotal}
              deliveryFee={deliveryFee}
              total={total}
              heading="Invoice"
              totalLabel={isCod ? 'Due on delivery' : 'Total paid'}
            />
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  )
}

OrderInvoice.PreviewProps = {
  orderId: '1c34b3b6-1234-5678-9abc-def012345678',
  orderUrl: 'https://techx-store.online/order/1c34b3b6-1234-5678-9abc-def012345678',
  total: 'Ks 555,000',
  subtotal: 'Ks 550,000',
  deliveryFee: 'Ks 5,000',
  method: 'KBZ Pay',
  kind: 'wallet',
  placedAt: '2026-08-19T03:35:00.000Z',
  updatedAt: '2026-08-19T07:32:00.000Z',
  items: [
    { qty: 1, name: 'Keychron K2 Pro', lineTotal: 'Ks 545,000' },
    { qty: 1, name: 'PBT Keycap Set - Sand', lineTotal: 'Ks 5,000' },
  ],
} satisfies OrderInvoiceProps

export default OrderInvoice
