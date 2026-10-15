import '../styles/ui.css'
import '../styles/desktopLink.css'

import { useId, useState } from 'react'

import { features } from '../config/features.ts'
import { MAX_PROTOCOL_URL_LENGTH, desktopUrl } from './jbrowseLinks.ts'

// Copies the web url rather than the jbrowse:// one: Desktop's "Open JBrowse
// Web link..." unwraps either, and the web url also opens in a browser.
function CopyUrl({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <span className="desktop-link-copy">
      <button
        type="button"
        className="ui-btn-secondary"
        onClick={() => {
          navigator.clipboard.writeText(url).then(
            () => {
              setState('copied')
            },
            () => {
              setState('failed')
            },
          )
        }}
      >
        {state === 'copied'
          ? 'Copied!'
          : state === 'failed'
            ? 'Copy failed'
            : 'Copy link'}
      </button>
      <code>{url}</code>
    </span>
  )
}

/**
 * Companion to an "open in JBrowse" link: the same session, in an installed
 * JBrowse Desktop instead of a browser tab. Takes the web launch url a
 * `specUrl` builder already produced, so the two links cannot describe
 * different sessions.
 *
 * A popover rather than the jbrowse:// link itself: the link does nothing on a
 * Desktop older than 5.0, or where nothing registered the protocol (a Linux
 * AppImage), and the page cannot tell. The popover holds the link and the url
 * to paste instead.
 *
 * Spans throughout, so a caller can put it inside a paragraph.
 *
 * Renders nothing for a session too large to hand the OS as a link, which an
 * inline protein alignment can be.
 */
export default function OpenInDesktop({
  webUrl,
  className = 'desktop-link-trigger',
}: {
  webUrl: string
  className?: string
}) {
  const id = useId()
  const href = desktopUrl(webUrl)
  return features.desktopLinks && href.length <= MAX_PROTOCOL_URL_LENGTH ? (
    <>
      <button
        type="button"
        className={className}
        popoverTarget={id}
      >
        Open in Desktop 5 →
      </button>
      <span
        id={id}
        popover="auto"
        className="desktop-link-pop"
      >
        <a
          className="desktop-link-open"
          href={href}
        >
          Open in JBrowse Desktop →
        </a>
        <span className="desktop-link-text">
          Needs JBrowse Desktop 5.0 or newer. If nothing opens, copy the link
          and paste it into Desktop&apos;s{' '}
          <strong>Open JBrowse Web link...</strong>, on the start screen or
          under <strong>File → Session</strong>.
        </span>
        <CopyUrl url={webUrl} />
      </span>
    </>
  ) : null
}
