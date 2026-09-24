import { features } from '../config/features.ts'
import { desktopUrl } from './jbrowseLinks.ts'

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
 * `className` comes from the call site rather than a style of its own, so a
 * secondary action looks like the launch beside it (`synteny-launch`).
 */
export default function OpenInDesktop({
  webUrl,
  className,
}: {
  webUrl: string
  className?: string
}) {
  return features.desktopLinks ? (
    <a
      className={className}
      href={desktopUrl(webUrl)}
      title={HINT}
    >
      Open in Desktop →
    </a>
  ) : null
}
