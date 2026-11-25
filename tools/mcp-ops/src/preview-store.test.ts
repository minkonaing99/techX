import { describe, expect, it } from 'vitest'
import { PREVIEW_TTL_MS, createPreviewStore } from './preview-store.ts'

describe('createPreviewStore', () => {
  it('hands a stored plan back once', () => {
    const store = createPreviewStore<string>()
    const id = store.put('plan')
    expect(store.take(id)).toBe('plan')
    expect(store.take(id)).toBeUndefined()
  })

  it('gives every plan its own id', () => {
    const store = createPreviewStore<number>()
    expect(store.put(1)).not.toBe(store.put(2))
  })

  it('forgets a plan after ten minutes', () => {
    let now = 1_000
    const store = createPreviewStore<string>(() => now)
    const id = store.put('plan')
    now += PREVIEW_TTL_MS + 1
    expect(store.take(id)).toBeUndefined()
    expect(PREVIEW_TTL_MS).toBe(10 * 60 * 1000)
  })

  it('knows nothing of an id it never issued', () => {
    expect(createPreviewStore<string>().take('made-up')).toBeUndefined()
  })
})

describe('createPreviewStore housekeeping', () => {
  it('issues full-length ids', () => {
    expect(createPreviewStore<string>().put('plan')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('drops expired plans when new ones arrive, so memory does not grow', () => {
    let now = 0
    const store = createPreviewStore<string>(() => now)
    for (let i = 0; i < 5; i++) store.put(`old${i}`)
    now += PREVIEW_TTL_MS + 1
    store.put('fresh')
    expect(store.size()).toBe(1)
  })
})
