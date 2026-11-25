import { Body, Button, Container, Heading, Html, Preview, Section, Text } from '@react-email/components'
import * as s from './_styles'
import { BrandHead } from './_head'
import { OrderMeta } from './_meta'
import { EmailFooter } from './_footer'

interface PaymentReminderProps {
  orderId: string
  orderUrl: string
  total: string
  method: string
  /** Formatted in Myanmar time. */
  deadline: string
}

/** Sent once, about six hours before an unpaid order is released. */
export function PaymentReminder({ orderId, orderUrl, total, method, deadline }: PaymentReminderProps) {
  return (
    <Html>
      <BrandHead />
      <Preview>Your TechX order is still waiting for payment</Preview>
      <Body style={s.body}>
        <Container style={s.shell}>
          <Section style={s.content}>
            <OrderMeta orderId={orderId} note="payment reminder" />
            <Heading style={s.display}>Your order is still waiting for payment.</Heading>
            <Text style={s.lead}>
              Transfer {total} with {method} and upload the slip before {deadline} (Myanmar time). After
              that the order is released and the items go back on sale.
            </Text>
            <Text style={s.lead}>Changed your mind? You can ignore this email, or cancel the order from its page.</Text>
            <Section style={s.buttonRow}>
              <Button href={orderUrl} style={s.buttonPrimary}>
                Pay and upload slip
              </Button>
            </Section>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  )
}

PaymentReminder.PreviewProps = {
  orderId: '1c34b3b6-1234-5678-9abc-def012345678',
  orderUrl: 'https://techx-store.online/order/1c34b3b6-1234-5678-9abc-def012345678',
  total: 'Ks 548,000',
  method: 'KBZ Pay',
  deadline: '24 Oct 2026, 14:30',
} satisfies PaymentReminderProps

export default PaymentReminder
