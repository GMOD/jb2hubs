import { features } from '../config/features.ts'
import { useDesktopLaunch } from '../hooks/useDesktopLaunch.ts'
import { launchHref, setPrefersDesktop } from '../lib/desktopPreference.ts'

import type { ReactNode } from 'react'

/**
 * The reader's choice of where launches open, shared by every launch on the
 * site through `useDesktopLaunch`. Off by default: a jbrowse:// link does
 * nothing on an install older than Desktop 5.0, and the page cannot tell.
 */
export function DesktopLaunchSwitch({ className }: { className?: string }) {
  const desktop = useDesktopLaunch()
  return features.desktopLinks ? (
    <label
      className={className}
      title="Send JBrowse launches to JBrowse Desktop 5.0 or newer. An older Desktop does nothing when a link is clicked."
    >
      <input
        type="checkbox"
        checked={desktop}
        onChange={e => {
          setPrefersDesktop(e.target.checked)
        }}
      />
      open in JBrowse Desktop
    </label>
  ) : null
}

/**
 * A JBrowse launch that follows the reader's choice of web or Desktop. Inside
 * an SVG it renders an SVG link, which takes no `title` attribute, so a
 * drawn target names itself with `ariaLabel` and a `<title>` child instead.
 */
export function LaunchLink({
  href,
  title,
  ariaLabel,
  className,
  children,
}: {
  href: string
  title?: string
  ariaLabel?: string
  className?: string
  children: ReactNode
}) {
  const desktop = useDesktopLaunch()
  return (
    <a
      href={launchHref(href, desktop)}
      title={title}
      aria-label={ariaLabel}
      className={className}
      target={desktop ? undefined : '_blank'}
      rel="noreferrer"
    >
      {children}
    </a>
  )
}
