import { describe, expect, it } from 'vitest'
import { SITE, telegramUrl } from './site-info'

describe('telegramUrl', () => {
  it('links the same handle the FAQ and contact page show', () => {
    expect(SITE.telegram).toBeTruthy()
    expect(telegramUrl()).toBe(`https://t.me/${SITE.telegram}`)
  })
})
