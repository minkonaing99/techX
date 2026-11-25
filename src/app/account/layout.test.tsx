import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1', name: 'A shopper' } }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect') } }))
vi.mock('@/components/account/account-nav', () => ({ AccountNav: () => null }))
let row: { name: string | null; email: string } | undefined = { name: 'Fresh name', email: 'a@b.co' }
vi.mock('@/db', () => {
  const c: Record<string, unknown> = {
    from: () => c,
    where: () => c,
    limit: () => c,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(row ? [row] : []).then(resolve),
  }
  return { db: { select: () => c } }
})

const { default: AccountLayout } = await import('./layout')

/** Every className in a rendered element tree. */
function classNames(node: unknown): string[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(classNames)
  const el = node as ReactElement<{ className?: string; children?: unknown }>
  return [...(el.props?.className ? [el.props.className] : []), ...classNames(el.props?.children)]
}

describe('AccountLayout on a phone', () => {
  it('lets the content column shrink to the screen instead of growing to its widest child', async () => {
    const tree = await AccountLayout({ children: null })
    const classes = classNames(tree)
    const grid = classes.find((c) => c.includes('grid'))!
    // One column on phones; on desktop the content column may shrink (minmax 0).
    expect(grid).toContain('grid-cols-1')
    expect(grid).toContain('md:grid-cols-[240px_minmax(0,1fr)]')
    expect(classes.filter((c) => c.split(' ').includes('min-w-0')).length).toBeGreaterThanOrEqual(1)
  })
})

/** All text in a rendered element tree. */
function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(texts)
  return texts((node as ReactElement<{ children?: unknown }>).props?.children)
}

describe('AccountLayout heading', () => {
  // The session carries the name from sign-in; a rename must show at once.
  it('reads the name from the account, not from the session', async () => {
    row = { name: 'Fresh name', email: 'a@b.co' }
    expect(texts(await AccountLayout({ children: null }))).toContain('Fresh name')
  })

  it('falls back to the email when there is no name', async () => {
    row = { name: '', email: 'a@b.co' }
    expect(texts(await AccountLayout({ children: null }))).toContain('a@b.co')
  })
})
