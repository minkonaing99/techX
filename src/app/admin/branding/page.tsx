import { getSetting } from '@/lib/site-settings'
import { whyMediaFromKey } from '@/lib/why-media'
import { WhyMediaUploader } from './why-media-uploader'

export const dynamic = 'force-dynamic'

export default async function BrandingPage() {
  const key = await getSetting('why_image')

  return (
    <div>
      <h2 className="font-display text-[22px] text-ink">Branding</h2>
      <p className="mt-1 text-[14px] text-muted">Customise homepage assets.</p>

      <div className="mt-8 space-y-2">
        <h3 className="font-medium text-[15px] text-ink">Why TechX - section photo or video</h3>
        <p className="text-[13px] text-muted">Shown in the left panel of the &ldquo;Why TechX&rdquo; section. PNG with transparent background supported.</p>
        <div className="mt-4">
          <WhyMediaUploader initial={whyMediaFromKey(key)} />
        </div>
      </div>
    </div>
  )
}
