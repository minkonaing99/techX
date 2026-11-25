import { Body, Button, Container, Heading, Html, Preview, Section, Text } from '@react-email/components'
import * as s from './_styles'
import { BrandHead } from './_head'
import { Masthead } from './_masthead'
import { EmailFooter } from './_footer'

interface PasswordResetProps {
  resetUrl: string
  ttlMinutes: number
}

/**
 * Sibling of `verify-email.tsx`, deliberately in the same plain shape - both
 * are a single link and nothing else, so neither buries the one thing the
 * recipient came for.
 *
 * The last line matters more here than it does there. This mail is what an
 * account takeover looks like from the victim's inbox, so it has to say plainly
 * that ignoring it leaves the password alone.
 */
export function PasswordReset({ resetUrl, ttlMinutes }: PasswordResetProps) {
  return (
    <Html>
      <BrandHead />
      <Preview>Reset your TechX password</Preview>
      <Body style={s.body}>
        <Container style={s.shell}>
          <Section style={s.content}>
            <Masthead />
            <Heading style={s.display}>Reset your password.</Heading>
            <Text style={s.lead}>
              Someone asked for a password reset on this address. Choose a new one here.
            </Text>
            <Section style={s.buttonRow}>
              <Button href={resetUrl} style={s.buttonPrimary}>
                Choose a new password
              </Button>
            </Section>
            <Text style={s.small}>
              The link expires in {ttlMinutes} minutes, and works once. Asking for another reset
              replaces it.
            </Text>
            <Text style={s.small}>
              If this was not you, ignore this email - your password has not changed, and nobody can
              sign in without opening the link above.
            </Text>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  )
}

PasswordReset.PreviewProps = {
  resetUrl: 'https://example.com/reset-password?token=abc&email=you@example.com',
  ttlMinutes: 15,
} satisfies PasswordResetProps

export default PasswordReset

