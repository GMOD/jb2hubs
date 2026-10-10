import { features } from '../config/features.ts'
import { MAX_PROTOCOL_URL_LENGTH, desktopUrl } from './jbrowseLinks.ts'

// The tooltip is the whole pre-5.0 story: an install without the handler does
// nothing at all when this is clicked, with no way for the page to detect it, so
// the fallback has to be stated up front rather than surfaced after the failure.
//
// The fallback names THIS link rather than the sibling "open in JBrowse" one,
// because Desktop's link parser unwraps a jbrowse:// url to the web url inside
// it — so either one pastes. Same release as the handler itself, so a build that
// can act on the link can also accept it pasted.
const HINT =
  'Opens in JBrowse Desktop 5.0 or newer. If nothing happens, copy this link (right-click → Copy link address) and use File → Session → Open JBrowse Web link...'

/**
 * Companion to an "open in JBrowse" link: the same session, in an installed
 * JBrowse Desktop instead of a browser tab. Takes the web launch url a
 * `specUrl` builder already produced, so the two links cannot describe
 * different sessions.
 *
 * Renders nothing for a session too large to hand the OS as a link, which an
 * inline protein alignment can be.
 *
 * `className` comes from the call site; the component has no style of its own.
 */
export default function OpenInDesktop({
  webUrl,
  className,
}: {
  webUrl: string
  className?: string
}) {
  const href = desktopUrl(webUrl)
  return features.desktopLinks && href.length <= MAX_PROTOCOL_URL_LENGTH ? (
    <a
      className={className}
      href={href}
      title={HINT}
    >
      Open in Desktop 5 →
    </a>
  ) : null
}
