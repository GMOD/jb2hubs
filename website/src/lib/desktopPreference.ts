import {
  MAX_PROTOCOL_URL_LENGTH,
  desktopUrl,
} from '../components/jbrowseLinks.ts'
import { readFlag, writeFlag } from './localFlag.ts'

// Whether this reader wants launches opened in JBrowse Desktop. Opt-in, because
// a jbrowse:// link does nothing at all on an install older than Desktop 5.0
// and the page cannot detect that.
const KEY = 'jb2hubs:openInDesktop'
const CHANGE_EVENT = 'jb2hubs:openInDesktop'

export function prefersDesktop() {
  return readFlag(KEY)
}

export function setPrefersDesktop(on: boolean) {
  writeFlag(KEY, on)
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeDesktopPreference(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function desktopLaunchUrl(webUrl: string) {
  const url = desktopUrl(webUrl)
  return url.length <= MAX_PROTOCOL_URL_LENGTH ? url : webUrl
}

export function launchHref(webUrl: string, desktop: boolean) {
  return desktop ? desktopLaunchUrl(webUrl) : webUrl
}
