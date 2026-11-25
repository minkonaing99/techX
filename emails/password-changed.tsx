import { Body, Button, Container, Heading, Html, Link, Preview, Section, Text } from '@react-email/components'
import * as s from './_styles'
import { BrandHead } from './_head'
import { Masthead } from './_masthead'
import { EmailFooter } from './_footer'

interface PasswordChangedProps {
  signinUrl: string
  contactUrl: string
}

/**
 * Sent after a password actually changes. Carries no link that does anything -
 * a notice that could itself be acted on would just be a second thing worth
 * stealing.
 *
 * This is the tripwire. If someone reached the account through this inbox, the
 * mail below is the only thing that puts that in front of the real owner, so
 * the "if this was not you" line names a route to a human rather than trailing
 * off.
 */
export function PasswordChanged({ signinUrl, contactUrl }: PasswordChangedProps) {
  return (
    <Html>
      <BrandHead />
      <Preview>Your TechX password was changed</Preview>
      <Body style={s.body}>
        <Container style={s.shell}>
          <Section style={s.content}>
            <Masthead />
            <Heading style={s.display}>Your password changed.</Heading>
            <Text style={s.lead}>
              The password on this account was just reset, and everywhere it was signed in has been
              signed out.
            </Text>
            <Section style={s.buttonRow}>
              <Button href={signinUrl} style={s.buttonPrimary}>
                Sign in
              </Button>
            </Section>
            <Text style={s.small}>
              If this was not you, someone else has read this inbox.{' '}
              <Link href={contactUrl} style={s.link}>
                Tell us
              </Link>{' '}
              and change the password on your email account too.
            </Text>
          </Section>
          <EmailFooter />
        </Container>
      </Body>
    </Html>
  )
}

PasswordChanged.PreviewProps = {
  signinUrl: 'https://example.com/signin',
  contactUrl: 'https://example.com/contact',
} satisfies PasswordChangedProps

export default PasswordChanged

