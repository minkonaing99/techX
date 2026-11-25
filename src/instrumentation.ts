import type { Instrumentation } from 'next'
import { reportError } from '@/lib/report-error'

/**
 * Runs once per server process on `next start` (never during `next build`).
 * Starts the unpaid-order sweep, production only so `next dev` never cancels
 * local test orders.
 *
 * The `NEXT_RUNTIME` check must stay literal: Next replaces it at compile time,
 * which is what keeps mysql2 and nodemailer out of the edge build. The sweep is
 * not awaited, so startup never waits on MySQL or SMTP, and nothing may throw
 * from here - Next rethrows it and the server does not boot.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production') {
    try {
      const { startOrderSweep } = await import('@/lib/order-sweep')
      startOrderSweep()
    } catch (err) {
      // Not awaited: the Telegram call has no timeout, and boot must not wait on it.
      void reportError(err, { path: 'register' })
    }
  }
}

/**
 * Next calls this for every uncaught server-side error - pages, layouts, route
 * handlers, server actions. Alerts the owner over the Telegram bot that already
 * carries order notifications, so there is no new service to run.
 *
 * ponytail: no Sentry until stack traces with source maps are worth paying for.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  await reportError(error, {
    path: request.path,
    method: request.method,
    digest:
      typeof error === 'object' && error !== null && 'digest' in error
        ? String((error as { digest?: unknown }).digest)
        : undefined,
  })
  console.error(`[${context.routeType}] ${request.method} ${request.path}`, error)
}
