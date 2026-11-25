// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ShippingView, type DivisionFee } from './shipping'

const ROWS: DivisionFee[] = [
  { id: 'mandalay', name: 'Mandalay Region', deliveryFeeMmk: 3_000, codAllowed: true },
  { id: 'bago', name: 'Bago Region', deliveryFeeMmk: 5_750, codAllowed: false },
]
const UNCOVERED = ['Kayah State', 'Kayin State', 'Sagaing Region']

afterEach(cleanup)

describe('ShippingView', () => {
  it('lists the divisions it cannot reach yet', () => {
    render(<ShippingView locale="en" rows={ROWS} uncovered={UNCOVERED} />)
    expect(
      screen.getByText(
        'Not covered yet: Kayah State, Kayin State and Sagaing Region. No courier serves them at the moment; message us to ask.',
      ),
    ).toBeTruthy()
  })

  it('puts the cap in the cash-on-delivery column', () => {
    render(<ShippingView locale="en" rows={ROWS} uncovered={[]} />)
    expect(screen.getByText('Yes, up to Ks 500,000')).toBeTruthy()
    expect(screen.getByText('No')).toBeTruthy()
    expect(screen.queryByText(/Not covered yet/)).toBeNull()
  })

  it('says the same in Burmese', () => {
    render(<ShippingView locale="my" rows={ROWS} uncovered={UNCOVERED} />)
    expect(screen.getByText('ရသည် (ကျပ် ၅၀၀,၀၀၀ အထိ)')).toBeTruthy()
    expect(screen.getByText(/Kayah State၊ Kayin State၊ Sagaing Region/)).toBeTruthy()
  })

  it('says an uploaded slip stops the 24-hour clock, in both languages', () => {
    render(<ShippingView locale="en" rows={ROWS} uncovered={[]} />)
    expect(screen.getByText(/An order with an uploaded slip is not cancelled while we check it\./)).toBeTruthy()
    cleanup()
    render(<ShippingView locale="my" rows={ROWS} uncovered={[]} />)
    expect(screen.getByText(/ငွေလွှဲပြေစာ တင်ပြီးသော အော်ဒါကို စစ်ဆေးနေစဉ် မပယ်ဖျက်ပါ/)).toBeTruthy()
  })

  it('says monitors are never cash on delivery, in both languages', () => {
    render(<ShippingView locale="en" rows={ROWS} uncovered={[]} />)
    expect(screen.getByText(/Ks 500,000, except monitors\./)).toBeTruthy()
    cleanup()
    render(<ShippingView locale="my" rows={ROWS} uncovered={[]} />)
    expect(screen.getByText(/မော်နီတာများအတွက် မရပါ။/)).toBeTruthy()
  })
})
