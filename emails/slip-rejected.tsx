import { Body, Button, Container, Heading, Html, Preview, Section, Text } from '@react-email/components'
import * as s from './_styles'
import { BrandHead } from './_head'
import { OrderMeta } from './_meta'
import { EmailFooter } from './_footer'

interface SlipRejectedProps {
  orderId: string
  orderUrl: string
  total: string
  method: string
  /** Written by the owner for this customer. */
  reason: string
  /** Formatted in Myanmar time. */
  deadline: string
}

/**
 * The owner sent the slip back. The order is alive with a fresh 24 hours, and
 * the customer may already have paid, so this says what to do either way.
 */
export function SlipRejected({ orderId, orderUrl, total, method, reason, deadline }: SlipRejectedProps) {
  return (
    <Html>
      <BrandHead />
      <Preview>We could not accept your payment slip - action needed</Preview>
      <Body style={s.body}>
        <Container style={s.shell}>
          <Section style={s.content}>
            <OrderMeta orderId={orderId} note="slip sent back" />
            <Heading style={s.display}>We could not accept your payment slip.</Heading>
            <Text style={s.lead}>Your order is still open, and we have kept your items for you.</Text>

            <Section style={s.noteBox}>
              <Text style={s.noteLabel}>Reason</Text>
              {/* The owner may write on several lines. */}
              <Text style={{ ...s.noteText, whiteSpace: 'pre-wrap' }}>{reason}</Text>
            </Section>

            <Text style={s.lead}>
              If the full {total} has not reached our {method} account yet, please transfer it. Then upload
              the correct slip before {deadline} (Myanmar time). After that the order is released.
            </Text>
            <Text style={s.lead}>
              Already paid the right amount? Upload a clearer slip with the transaction reference, or reply
              to this email and we will check.
            </Text>

            <Section style={s.buttonRow}>
              <Button href={orderUrl} style={s.buttonPrimary}>
                Upload a new slip
              </Button>
            </Section>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  )
}

SlipRejected.PreviewProps = {
  orderId: '1c34b3b6-1234-5678-9abc-def012345678',
  orderUrl: 'https://techx-store.online/order/1c34b3b6-1234-5678-9abc-def012345678',
  total: 'Ks 548,000',
  method: 'KBZ Pay',
  reason: 'The amount on the slip does not match the order total. You sent Ks 540,000.',
  deadline: '24 Oct 2026, 14:30',
} satisfies SlipRejectedProps

export default SlipRejected
