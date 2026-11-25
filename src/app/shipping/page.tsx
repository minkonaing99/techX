import { SHIPPING_META, SHIPPING_PATH, ShippingView } from '@/components/pages/shipping'
import { getDeliveryFees, getUncoveredDivisions } from '@/lib/delivery-fees'
import { languageAlternates } from '@/lib/i18n'

export const metadata = {
  ...SHIPPING_META.en,
  alternates: { canonical: SHIPPING_PATH, languages: languageAlternates(SHIPPING_PATH) },
}

export const dynamic = 'force-dynamic'

export default async function ShippingPage() {
  const [rows, uncovered] = await Promise.all([getDeliveryFees(), getUncoveredDivisions()])
  return <ShippingView locale="en" rows={rows} uncovered={uncovered} />
}
