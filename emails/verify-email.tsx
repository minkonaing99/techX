import { Body, Button, Container, Heading, Html, Preview, Section, Text } from '@react-email/components'
import * as s from './_styles'
import { BrandHead } from './_head'
import { Masthead } from './_masthead'
import { EmailFooter } from './_footer'

interface VerifyEmailProps {
  verifyUrl: string
  ttlMinutes: number
}

export function VerifyEmail({ verifyUrl, ttlMinutes }: VerifyEmailProps) {
  return (
    <Html>
      <BrandHead />
      <Preview>Verify your TechX account</Preview>
      <Body style={s.body}>
        <Container style={s.shell}>
          <Section style={s.content}>
            <Masthead />
            <Heading style={s.display}>Verify your email.</Heading>
            <Text style={s.lead}>
              Welcome. Confirm your address to start placing orders and saving wishlists.
            </Text>
            <Section style={s.buttonRow}>
              <Button href={verifyUrl} style={s.buttonPrimary}>
                Verify email
              </Button>
            </Section>
            <Text style={s.small}>
              The link expires in {ttlMinutes} minutes. If it does, sign up again to get a new one.
            </Text>
            <Text style={s.small}>If you did not sign up, ignore this email.</Text>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  )
}

VerifyEmail.PreviewProps = {
  verifyUrl: 'https://example.com/verify?token=abc&email=you@example.com',
  ttlMinutes: 30,
} satisfies VerifyEmailProps

export default VerifyEmail

