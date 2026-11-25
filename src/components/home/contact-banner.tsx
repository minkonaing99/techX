import { MessageCircle, Send } from 'lucide-react'

/*
 * The homepage's closing banner: talk to a person before buying. The hero and
 * the product grid already show products, so this one shows a short example
 * conversation instead - what "connect with us" actually gets you. Channels
 * come from `SITE` (src/lib/site-info.ts); an unset one is hidden.
 */

interface ContactBannerProps {
  /** Telegram username, with or without the @. */
  telegram: string | null
  /** Full Facebook page URL. */
  facebook: string | null
}

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

/**
 * Who said it decides the side and colour. Deliberately general - no product
 * names - so it never goes stale or favours one item; these are things we
 * would really say.
 */
const EXAMPLE = [
  { from: 'customer', text: 'I want a quiet keyboard, but I like mechanical. Is there one that is both?' },
  { from: 'us', text: 'Yes - silent linear switches with a gasket mount are soft and still feel mechanical. Where do you type?' },
  { from: 'customer', text: 'At night, next to someone sleeping.' },
  { from: 'us', text: 'Then silent switches. We will send you the ones we have tried.' },
] as const

/*
 * A full-width cream band with a fine dot grid, drawn in CSS so there is no
 * image to download. Colours come from the theme tokens.
 */
const BAND_STYLE = {
  // #F7F6F3, the page cream: the dots alone mark the band.
  backgroundColor: 'var(--color-cream)',
  backgroundImage: 'radial-gradient(color-mix(in srgb, var(--color-muted) 30%, transparent) 1.1px, transparent 1.1px)',
  backgroundSize: '30px 30px',
} as const

function ExampleChat() {
  return (
    <figure aria-labelledby="contact-example" className="rounded-[var(--radius)] bg-cream p-4 md:p-5">
      <figcaption id="contact-example" className="sr-only">
        An example of a question we answer
      </figcaption>
      <div className="flex flex-col gap-2">
        {EXAMPLE.map((m) => (
          <p
            key={m.text}
            className={
              m.from === 'us'
                ? 'max-w-[85%] self-end rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-[13px] leading-snug text-cream'
                : 'max-w-[85%] self-start rounded-2xl rounded-bl-md bg-surface px-3.5 py-2 text-[13px] leading-snug text-ink'
            }
          >
            {m.text}
          </p>
        ))}
      </div>
    </figure>
  )
}

export function ContactBanner({ telegram, facebook }: ContactBannerProps) {
  const handle = telegram?.replace(/^@/, '').trim()
  if (!handle && !facebook) return null

  return (
    // -mb-24 cancels the footer's mt-24, so the band meets the footer and the
    // space above and below the card is the same.
    <section style={BAND_STYLE} className="-mb-24 py-12 md:py-16">
      <div className="container-prose">
        <div className="grid items-center gap-8 rounded-[var(--radius-lg)] bg-surface p-6 md:grid-cols-[1.15fr_1fr] md:gap-12 md:p-10">
          <div>
            <div className="eyebrow">Not sure yet?</div>
            <h2 className="mt-3 font-display text-[30px] leading-[1.08] text-ink md:text-[34px] lg:text-[38px]">
              Connect with us before you buy.{' '}
              {/* Its own line from md up, so the accent never splits across lines. */}
              <em className="not-italic text-accent md:block">Choose carefully.</em>
            </h2>
            <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-ink-soft">
              Switch noise, grip size, whether it works with your Mac. Someone who has used it will answer.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {handle && (
                <a
                  href={`https://t.me/${encodeURIComponent(handle)}`}
                  {...EXTERNAL}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-accent px-5 py-2.5 text-[14px] font-medium text-cream transition-colors hover:bg-[var(--color-accent-soft)]"
                >
                  <Send size={16} strokeWidth={1.75} aria-hidden="true" />
                  Message on Telegram
                </a>
              )}
              {facebook && (
                <a
                  href={facebook}
                  {...EXTERNAL}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-line bg-cream px-5 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-sand"
                >
                  <MessageCircle size={16} strokeWidth={1.75} aria-hidden="true" />
                  Message on Facebook
                </a>
              )}
            </div>
          </div>

          <ExampleChat />
        </div>
      </div>
    </section>
  )
}
