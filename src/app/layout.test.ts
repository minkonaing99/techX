import { describe, expect, it, vi } from 'vitest'

const calls: Record<string, Record<string, unknown>> = {}
vi.mock('next/font/google', () => {
  const font = (name: string) => (options: Record<string, unknown>) => {
    calls[name] = options
    return { variable: `--${name}` }
  }
  return { Fraunces: font('Fraunces'), Inter: font('Inter'), Noto_Sans_Myanmar: font('Noto_Sans_Myanmar') }
})
// Everything layout.tsx imports is stubbed so only the font calls run; keep this
// list in step with the layout's imports.
vi.mock('./globals.css', () => ({}))
vi.mock('sonner', () => ({ Toaster: () => null }))
vi.mock('@/components/nav', () => ({ Nav: () => null }))
vi.mock('@/components/footer', () => ({ Footer: () => null }))
vi.mock('@/components/cart-drawer', () => ({ CartDrawer: () => null }))
vi.mock('@/components/cart-hydrator', () => ({ CartHydrator: () => null }))
vi.mock('@/components/wishlist/wishlist-hydrator', () => ({ WishlistHydrator: () => null }))
vi.mock('@/components/motion-provider', () => ({ MotionProvider: () => null }))
vi.mock('@/components/auth-provider', () => ({ AuthProvider: () => null }))
vi.mock('@/components/nav-progress', () => ({ NavProgress: () => null }))

await import('./layout')

describe('root layout fonts', () => {
  // Only `font-my` elements use Noto; preloading it put 151 KB ahead of the
  // main image on every English page.
  it('does not preload the Burmese font', () => {
    expect(calls.Noto_Sans_Myanmar).toMatchObject({ preload: false, display: 'swap' })
  })

  it('still preloads the fonts every page uses', () => {
    expect(calls.Fraunces?.preload).not.toBe(false)
    expect(calls.Inter?.preload).not.toBe(false)
  })
})
