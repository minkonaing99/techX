import { Column, Row, Text } from '@react-email/components'
import { shortTimestamp } from '@/lib/relative-time'
import { progressSteps, type MethodKind, type ProgressState } from '@/lib/order-status'
import type { OrderStatus } from '@/db/schema/orders'
import * as s from './_styles'

/** Done and current steps carry the accent; steps to come are a hairline of the same weight. */
const RULE: Record<ProgressState, string> = {
  done: s.ACCENT,
  current: s.ACCENT,
  todo: s.LINE,
}

const LABEL: Record<ProgressState, string> = {
  done: s.INK_SOFT,
  current: s.INK,
  todo: s.MUTED,
}

interface OrderRailProps {
  status: OrderStatus
  kind: MethodKind
  placedAt: string
  updatedAt: string
}

/**
 * The order rail as a row of table cells, each with a top border for its rule. The web
 * version is a CSS grid that restacks under a media query; Outlook's Word
 * engine ignores both, so this one never reflows. Three or four short labels
 * fit the content width at 12px.
 */
export function OrderRail({ status, kind, placedAt, updatedAt }: OrderRailProps) {
  const steps = progressSteps(status, kind)
  if (steps.length === 0) return null

  const width = `${(100 / steps.length).toFixed(4)}%`

  return (
    <Row style={s.rail}>
      {steps.map((step, i) => {
        // Only two timestamps exist on an order, so only the first and the live
        // step can be dated. Middle steps show no time.
        const isCurrent = step.state === 'current'
        const stamp = i === 0 ? placedAt : isCurrent && i > 0 ? updatedAt : null

        return (
          <Column key={step.status} style={{ ...s.railStep, width }}>
            <Row>
              <Column style={{ ...s.railRule, borderTop: `2px solid ${RULE[step.state]}` }}>
                <Text style={{ ...s.railLabel, color: LABEL[step.state] }}>{step.label}</Text>
                {stamp && <Text style={s.railDate}>{shortTimestamp(stamp)}</Text>}
              </Column>
            </Row>
          </Column>
        )
      })}
    </Row>
  )
}

export default OrderRail
