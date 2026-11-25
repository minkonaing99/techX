import { Head } from '@react-email/components'

/** Latin subset of the Fraunces variable face, the storefront display font. */
const FRAUNCES_WOFF2 =
  'https://fonts.gstatic.com/s/fraunces/v38/6NU78FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0KxC9TeP2Xz5c.woff2'

/**
 * Apple Mail, iOS Mail and Outlook.com honour the webfont and render the real
 * brand headline. Gmail strips @font-face and lands on Georgia, the fallback in
 * the headline's own font stack.
 *
 * Declared by hand rather than with React Email's `<Font>`: that component
 * also emits `* { font-family: Fraunces, Georgia }`, which turned every line of
 * body text serif. Only the styles that name Fraunces should use it.
 */
export function BrandHead() {
  return (
    <Head>
      <style>{`@font-face { font-family: 'Fraunces'; font-style: normal; font-weight: 300 400; src: url(${FRAUNCES_WOFF2}) format('woff2'); }`}</style>
    </Head>
  )
}

export default BrandHead
