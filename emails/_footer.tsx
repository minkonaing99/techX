import { Column, Link, Row, Section, Text } from '@react-email/components'
import * as s from './_styles'

/** Light sign-off under a hairline, shared by customer emails. */
export function EmailFooter() {
  return (
    <Row>
      <Column style={s.footerCell}>
        <Section style={s.footer}>
          <Text style={s.footerMark}>TechX</Text>
          <Text style={s.footerTag}>Tech gear, picked with care.</Text>
          <Text style={s.footerMeta}>
            Your City, Myanmar · Reply to this email and a human answers. Backup contact on{' '}
            <Link href="https://t.me/your_telegram" style={s.footerLink}>
              Telegram
            </Link>
            .
          </Text>
        </Section>
      </Column>
    </Row>
  )
}

export default EmailFooter
