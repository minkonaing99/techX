import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMail = vi.fn<(p: { to: string }) => Promise<{ delivered: boolean }>>(async () => ({ delivered: true }))
const sendTelegram = vi.fn<(text: string) => Promise<boolean>>(async () => true)

vi.mock('@/lib/mail', () => ({ sendMail: (p: { to: string }) => sendMail(p) }))
vi.mock('@/lib/telegram', () => ({ sendTelegram: (t: string) => sendTelegram(t) }))

const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const { mailOrAlert } = await import('./notify')

const TO = 'minkonaing@gmail.com'
const MAIL = { to: TO, subject: 'Reset your password', text: 'https://store.example/reset?token=abc123' }

function alertText(): string {
  return sendTelegram.mock.calls[0]?.[0] ?? ''
}

beforeEach(() => {
  sendMail.mockReset()
  sendMail.mockResolvedValue({ delivered: true })
  sendTelegram.mockReset()
  sendTelegram.mockResolvedValue(true)
  errorSpy.mockClear()
})

describe('mailOrAlert', () => {
  it('sends the email and stays quiet when it goes out', async () => {
    await expect(mailOrAlert(MAIL, 'password reset')).resolves.toBe(true)
    expect(sendMail).toHaveBeenCalledOnce()
    expect(sendTelegram).not.toHaveBeenCalled()
  })

  it('alerts the owner on Telegram when the email fails, naming what and to whom', async () => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error('Invalid login'), { responseCode: 535 }))
    await expect(mailOrAlert(MAIL, 'order AB12CD34 placed (customer)')).resolves.toBe(false)
    const text = alertText()
    expect(text).toContain('Email not sent')
    expect(text).toContain('order AB12CD34 placed (customer)')
    expect(text).toContain('mink***@gmail.com')
    expect(text).toContain('535')
    expect(text).toContain('Invalid login')
  })

  it('never puts the full address on Telegram, even when the SMTP error repeats it', async () => {
    sendMail.mockRejectedValueOnce(new Error(`550 5.1.1 <${TO}>: Recipient address rejected`))
    await mailOrAlert(MAIL, 'invoice')
    expect(alertText()).not.toContain(TO)
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(TO)
  })

  it('cuts a long error short', async () => {
    sendMail.mockRejectedValueOnce(new Error('x'.repeat(1000)))
    await mailOrAlert(MAIL, 'invoice')
    expect(alertText().length).toBeLessThan(400)
  })

  it('counts an unconfigured SMTP as not sent', async () => {
    sendMail.mockResolvedValueOnce({ delivered: false })
    await expect(mailOrAlert(MAIL, 'invoice')).resolves.toBe(false)
    expect(alertText()).toContain('SMTP not configured')
  })

  it('masks every address in the error, whatever its case, not only the recipient', async () => {
    sendMail.mockRejectedValueOnce(new Error('550 <MinKoNaing@Gmail.com> and forward-to@example.org rejected'))
    await mailOrAlert(MAIL, 'invoice')
    expect(alertText()).not.toMatch(/minkonaing@gmail\.com/i)
    expect(alertText()).not.toContain('forward-to@example.org')
  })

  it('flattens a multi-line server reply, so it cannot forge log lines or lay out a fake message', async () => {
    sendMail.mockRejectedValueOnce(new Error('550 rejected\r\n[mail] sent OK\nClick https://evil.example'))
    await mailOrAlert(MAIL, 'invoice')
    const reason = alertText().split('\n').slice(1)
    expect(reason).toHaveLength(1)
    expect(reason[0]).toContain('550 rejected [mail] sent OK Click')
  })

  it('stays readable when there is no recipient', async () => {
    sendMail.mockRejectedValueOnce(new Error('No recipients defined'))
    await mailOrAlert({ ...MAIL, to: '' }, 'order AB12CD34 cancelled (customer)')
    expect(alertText()).toContain('No recipients defined')
  })

  it('never throws, even when the alert fails too', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'))
    sendTelegram.mockRejectedValueOnce(new Error('telegram down'))
    await expect(mailOrAlert(MAIL, 'invoice')).resolves.toBe(false)
  })
})
