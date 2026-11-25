import { Column, Row, Text } from '@react-email/components'
import * as s from './_styles'

interface MastheadProps {
  /** Right-hand reference, e.g. `No. 1C34B3B6 · KBZ Pay`. Omit for account emails. */
  reference?: string
}

/** `TechX` on the left, the reference on the right, over the ink rule every email opens with. */
export function Masthead({ reference }: MastheadProps) {
  return (
    <Row style={s.mast}>
      <Column style={s.mastBrandCell}>
        <Text style={s.mastBrand}>TechX</Text>
      </Column>
      {reference ? (
        <Column style={s.mastRefCell}>
          <Text style={s.mastRef}>{reference}</Text>
        </Column>
      ) : null}
    </Row>
  )
}

export default Masthead
