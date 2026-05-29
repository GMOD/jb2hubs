import { useCallback, useEffect, useState } from 'react'

/**
 * Syncs a piece of state to a URL search parameter via history.replaceState.
 * When the current value equals `defaultValue`, the param is omitted from the URL.
 * Listens to popstate so back/forward keeps state in sync.
 */
export function useUrlState(key: string, defaultValue: string) {
  const read = useCallback(() => {
    if (typeof window === 'undefined') {
      return defaultValue
    }
    return new URLSearchParams(window.location.search).get(key) ?? defaultValue
  }, [key, defaultValue])

  const [value, setValueState] = useState(defaultValue)

  useEffect(() => {
    setValueState(read())
    const onPop = () => {
      setValueState(read())
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
    }
  }, [read])

  const setValue = useCallback(
    (next: string) => {
      setValueState(next)
      const url = new URL(window.location.href)
      if (next && next !== defaultValue) {
        url.searchParams.set(key, next)
      } else {
        url.searchParams.delete(key)
      }
      window.history.replaceState({}, '', url.toString())
    },
    [key, defaultValue],
  )

  return [value, setValue] as const
}
