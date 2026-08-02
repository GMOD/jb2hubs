import { features } from '../config/features.ts'
import { desktopUrl } from './jbrowseLinks.ts'

// The tooltip is the whole pre-5.0 story: an install without the handler does
// nothing at all when this is clicked, with no way for the page to detect it, so
// the fallback has to be stated up front rather than surfaced after the failure.
const HINT =
  'Opens in JBrowse Desktop 5.0 or newer. If nothing happens, copy the JBrowse link and use File → Session → Open JBrowse Web link...'

/**
 * Companion to an "open in JBrowse" link: the same session, in an installed
 * JBrowse Desktop instead of a browser tab. Takes the web launch url a
 * `specUrl` builder already produced, so the two links cannot describe
 * different sessions.
 *
 * `className` comes from the call site rather than a style of its own — each
 * launch surface has its own button vocabulary (`pg-launch-btn`, `portal-btn`,
 * `synteny-launch`), and a secondary action should look like one of those.
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
