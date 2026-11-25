import { randomUUID } from 'node:crypto'

/** How long a preview stays applicable. */
export const PREVIEW_TTL_MS = 10 * 60 * 1000

export interface PreviewStore<T> {
  put(plan: T): string
  /** The plan, once: taking it removes it. Undefined if unknown or expired. */
  take(id: string): T | undefined
  /** Plans held, expired ones included until the next put. */
  size(): number
}

/**
 * Plans the owner has previewed, kept in this process's memory. Applying takes
 * a `previewId`, not values, so a 50-row plan cannot be retyped or altered
 * between preview and apply. Restarting the server forgets every plan: preview
 * again.
 */
export function createPreviewStore<T>(now: () => number = Date.now): PreviewStore<T> {
  const plans = new Map<string, { plan: T; expires: number }>()
  return {
    put(plan) {
      for (const [key, entry] of plans) if (entry.expires < now()) plans.delete(key)
      const id = randomUUID()
      plans.set(id, { plan, expires: now() + PREVIEW_TTL_MS })
      return id
    },
    take(id) {
      const entry = plans.get(id)
      plans.delete(id)
      return entry && entry.expires >= now() ? entry.plan : undefined
    },
    size: () => plans.size,
  }
}
