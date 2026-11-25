import { SHIPPING_META, SHIPPING_PATH, ShippingView } from '@/components/pages/shipping'
import { getDeliveryFees, getUncoveredDivisions } from '@/lib/delivery-fees'
import { languageAlternates, localePath } from '@/lib/i18n'

export const metadata = {
  ...SHIPPING_META.my,
  alternates: {
    canonical: localePath('my', SHIPPING_PATH),
    languages: languageAlternates(SHIPPING_PATH),
  },
}

export const dynamic = 'force-dynamic'

export default async function ShippingPageMy() {
  const [rows, uncovered] = await Promise.all([getDeliveryFees(), getUncoveredDivisions()])
  return <ShippingView locale="my" rows={rows} uncovered={uncovered} />
}
