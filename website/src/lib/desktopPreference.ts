import {
  MAX_PROTOCOL_URL_LENGTH,
  desktopUrl,
} from '../components/jbrowseLinks.ts'

// Whether this reader wants launches opened in JBrowse Desktop. Opt-in, because
// a jbrowse:// link does nothing at all on an install older than Desktop 5.0
// and the page cannot detect that.
const KEY = 'jb2hubs:openInDesktop'
const CHANGE_EVENT = 'jb2hubs:openInDesktop'

function storage() {
  return (globalThis as { localStorage?: Storage }).localStorage
}

export function prefersDesktop() {
  try {
    return storage()?.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setPrefersDesktop(on: boolean) {
  try {
    if (on) {
      storage()?.setItem(KEY, '1')
    } else {
      storage()?.removeItem(KEY)
    }
  } catch {
    // a private window without storage keeps the default
  }
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

// A click handler's launch. A jbrowse:// url opened in a new tab leaves a blank
// tab behind, so Desktop is handed the link from this page.
export function openLaunch(webUrl: string) {
  const url = prefersDesktop() ? desktopLaunchUrl(webUrl) : webUrl
  if (url !== webUrl) {
    window.location.href = url
  } else {
    window.open(webUrl, '_blank', 'noopener')
  }
}
