import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendTelegram } from './telegram'

const fetchMock = vi.fn<(url: string, init: { body: string; signal?: AbortSignal }) => Promise<Response>>(
  async () => new Response('{"ok":true}'),
)
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

function sentBody(): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0]?.[1].body ?? '{}')
}

beforeEach(() => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token')
  vi.stubEnv('TELEGRAM_OWNER_CHAT_ID', '12345')
  fetchMock.mockClear()
  errorSpy.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

describe('sendTelegram', () => {
  it('sends as plain text, so an awkward character cannot make Telegram reject the alert', async () => {
    await sendTelegram('New order <KBZPay & Co>')
    const body = sentBody()
    expect(body.parse_mode).toBeUndefined()
    expect(body.text).toBe('New order <KBZPay & Co>')
  })

  it('marks up only when the caller asks', async () => {
    await sendTelegram('<b>Site error</b>', { html: true })
    expect(sentBody().parse_mode).toBe('HTML')
  })

  it('stays silent when no bot is configured', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    await sendTelegram('nobody is listening')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows an outage rather than failing the order it was reporting on', async () => {
    fetchMock.mockRejectedValueOnce(new Error('telegram down'))
    await expect(sendTelegram('still fine')).resolves.toBe(false)
  })

  it('says whether the message was delivered', async () => {
    await expect(sendTelegram('hello')).resolves.toBe(true)
  })

  it('treats a refused message as not delivered - a bad token or blocked bot used to look like success', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), { status: 401 }),
    )
    await expect(sendTelegram('hello')).resolves.toBe(false)
    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).toContain('401')
    expect(logged).toContain('Unauthorized')
  })

  it('never logs the bot token, which is part of the URL', async () => {
    fetchMock.mockRejectedValueOnce(
      new TypeError('Failed to parse URL from https://api.telegram.org/bottest-token/sendMessage'),
    )
    await sendTelegram('hello')
    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).not.toContain('test-token')
    expect(logged).toContain('***')
  })

  it('reports not delivered, without logging, when no bot is configured', async () => {
    vi.stubEnv('TELEGRAM_OWNER_CHAT_ID', '')
    await expect(sendTelegram('nobody')).resolves.toBe(false)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('gives up after a timeout rather than hanging the request', async () => {
    await sendTelegram('hello')
    expect(fetchMock.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal)
  })
})
