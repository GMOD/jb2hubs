import { useCallback, useSyncExternalStore } from 'react'

// The URL is an external store, so this reads it as one. That is not a
// formality: the value differs between the server render and the client, and
// `useSyncExternalStore`'s third argument is the supported way to say so --
// hydration uses the server snapshot, then React re-renders with the client's.
// A lazy `useState` initializer would read the real URL during hydration and
// mismatch the HTML; a `useEffect` that calls setState commits one render with
// the wrong value first, which is what oxlint's react/set-state-in-effect flags.
//
// `history.replaceState` fires no event, so our own writes would be invisible to
// any subscriber. Rather than keeping a module-level listener list -- a global,
// and one that outlives every component that used it -- setValue dispatches a
// custom event on window and the store listens for it alongside popstate. The
// event is our own name, so nothing else on the page is disturbed by it, and
// every hook instance re-reads: two components bound to the same param stay in
// step, which the old per-component useState did not manage.

const URL_STATE_EVENT = 'jb2hubs:urlstate'

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange)
  window.addEventListener(URL_STATE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(URL_STATE_EVENT, onChange)
  }
}

/**
 * Syncs a piece of state to a URL search parameter via history.replaceState.
 * When the current value equals `defaultValue`, the param is omitted from the
 * URL. Back/forward keeps state in sync, and so does another hook writing the
 * same param.
 */
export function useUrlState(key: string, defaultValue: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(key) ?? defaultValue,
    () => defaultValue,
  )

  const setValue = useCallback(
    (next: string) => {
      const url = new URL(window.location.href)
      if (next && next !== defaultValue) {
        url.searchParams.set(key, next)
      } else {
        url.searchParams.delete(key)
      }
      window.history.replaceState({}, '', url.toString())
      window.dispatchEvent(new Event(URL_STATE_EVENT))
    },
    [key, defaultValue],
  )

  return [value, setValue] as const
}
