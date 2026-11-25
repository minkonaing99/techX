import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { render } from '@react-email/render'
import { LowStockAlert } from './low-stock-alert'
import { NewOrderAlert } from './new-order-alert'
import { OrderCancelled } from './order-cancelled'
import { OrderDelivered } from './order-delivered'
import { OrderInvoice } from './order-invoice'
import { OrderPlaced } from './order-placed'
import { PasswordChanged } from './password-changed'
import { PasswordReset } from './password-reset'
import { PaymentReminder } from './payment-reminder'
import { SlipReceived } from './slip-received'
import { SlipRejected } from './slip-rejected'
import { SlipSubmittedAlert } from './slip-submitted-alert'
import { VerifyEmail } from './verify-email'

const COD_INVOICE = { ...OrderInvoice.PreviewProps, method: 'Cash on Delivery', kind: 'cod' as const }

const TEMPLATES: Array<[string, ReactElement]> = [
  ['low-stock-alert', <LowStockAlert key="a" {...LowStockAlert.PreviewProps} />],
  ['new-order-alert', <NewOrderAlert key="b" {...NewOrderAlert.PreviewProps} />],
  ['order-cancelled', <OrderCancelled key="c" {...OrderCancelled.PreviewProps} />],
  ['order-delivered', <OrderDelivered key="d" {...OrderDelivered.PreviewProps} />],
  ['order-invoice', <OrderInvoice key="e" {...OrderInvoice.PreviewProps} />],
  ['order-invoice cod', <OrderInvoice key="f" {...COD_INVOICE} />],
  ['order-placed', <OrderPlaced key="g" {...OrderPlaced.PreviewProps} />],
  ['password-changed', <PasswordChanged key="h" {...PasswordChanged.PreviewProps} />],
  ['password-reset', <PasswordReset key="i" {...PasswordReset.PreviewProps} />],
  ['payment-reminder', <PaymentReminder key="j" {...PaymentReminder.PreviewProps} />],
  ['slip-received', <SlipReceived key="k" {...SlipReceived.PreviewProps} />],
  ['slip-rejected', <SlipRejected key="l" {...SlipRejected.PreviewProps} />],
  ['slip-submitted-alert', <SlipSubmittedAlert key="m" {...SlipSubmittedAlert.PreviewProps} />],
  ['verify-email', <VerifyEmail key="n" {...VerifyEmail.PreviewProps} />],
]

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&rsquo;|&#8217;/g, '\u2019').replace(/\s+/g, ' ')

describe.each(TEMPLATES)('%s', (_, email) => {
  it('uses no bold: every weight is regular or lighter, and no <strong> or <b>', async () => {
    const html = await render(email)
    expect(html).not.toMatch(/font-weight:\s*(bold|[5-9]00)/)
    expect(html).not.toMatch(/<(strong|b)[\s>]/)
  })

  it('has square corners and no dark footer band', async () => {
    const html = await render(email)
    expect(html).not.toMatch(/border-radius:\s*(?!0[;"p ])[0-9.]+/)
    expect(html.toLowerCase()).not.toContain('#161513')
  })

  it('carries the TechX masthead', async () => {
    expect(text(await render(email))).toContain('TechX')
  })
})

describe('OrderInvoice wording', () => {
  it('tells a wallet customer it is paid', async () => {
    const t = text(await render(<OrderInvoice {...OrderInvoice.PreviewProps} />))
    expect(t).toContain('It\u2019s paid. We\u2019re packing.')
    expect(t).toContain('Total paid')
  })

  it('never tells a cash-on-delivery customer it is paid', async () => {
    const t = text(await render(<OrderInvoice {...COD_INVOICE} />))
    expect(t).toContain('Confirmed. We\u2019re packing.')
    expect(t).toContain(`Pay ${COD_INVOICE.total} to the courier when it arrives.`)
    expect(t).toContain('Due on delivery')
    expect(t.toLowerCase()).not.toContain('paid')
  })
})

describe('the order masthead', () => {
  it('puts the short order number on the right of the brand', async () => {
    const t = text(await render(<OrderCancelled {...OrderCancelled.PreviewProps} />))
    expect(t).toMatch(/TechX .*No\. [0-9A-F]{8}/)
  })
})

describe('the body font', () => {
  it('falls back to a plain sans-serif where the system faces are missing', async () => {
    const html = await render(<OrderCancelled {...OrderCancelled.PreviewProps} />)
    expect(html).toMatch(/font-family:[^>]*?Helvetica, Arial, sans-serif/)
  })
})

describe('the brand head', () => {
  it('declares the Fraunces face without forcing it onto every element', async () => {
    const html = await render(<OrderCancelled {...OrderCancelled.PreviewProps} />)
    expect(html).toContain('@font-face')
    expect(html).not.toMatch(/\*\s*\{[^}]*font-family/)
  })
})

describe('ledger structure', () => {
  it.each(TEMPLATES)('%s opens with the masthead rule before the headline', async (_, email) => {
    const html = await render(email)
    const rule = html.search(/border-bottom:1px solid #1c1b19/)
    expect(rule).toBeGreaterThan(-1)
    expect(rule).toBeLessThan(html.indexOf('<h1'))
  })

  it('closes customer emails with the light footer rule', async () => {
    const html = await render(<OrderCancelled {...OrderCancelled.PreviewProps} />)
    expect(html).toMatch(/border-top:1px solid #e0dcd3[^>]*>(?:(?!<h1).)*Peripherals for the desk/s)
  })

  it('draws the progress line as cell borders, three steps for COD and four for a wallet', async () => {
    const cod = await render(<OrderPlaced {...OrderPlaced.PreviewProps} kind="cod" method="Cash on Delivery" accountName={null} accountPhone={null} />)
    const wallet = await render(<OrderPlaced {...OrderPlaced.PreviewProps} />)
    expect(cod.match(/border-top:2px solid/g)).toHaveLength(3)
    expect(wallet.match(/border-top:2px solid/g)).toHaveLength(4)
  })

  it('keeps terracotta off ordinary links', async () => {
    const html = await render(<NewOrderAlert {...NewOrderAlert.PreviewProps} />)
    const phone = html.match(/<a href="tel:[^"]*" style="([^"]*)"/)
    expect(phone?.[1]).toContain('color:#1c1b19')
  })
})

describe('OrderPlaced wording', () => {
  it('never asks a cash-on-delivery customer for a transfer or a slip', async () => {
    const t = text(await render(<OrderPlaced {...OrderPlaced.PreviewProps} kind="cod" method="Cash on Delivery" accountName={null} accountPhone={null} />))
    expect(t).toContain('Order placed. We’ll call you.')
    expect(t.toLowerCase()).not.toMatch(/transfer|slip/)
  })
})

describe('SlipReceived', () => {
  it('names the amount in the body, keeping the masthead short', async () => {
    const t = text(await render(<SlipReceived {...SlipReceived.PreviewProps} />))
    expect(t).toContain(`checking your ${SlipReceived.PreviewProps.total} transfer`)
  })
})
