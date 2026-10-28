import { useState } from 'react'

// State that returns to `initial` whenever `key` changes, such as a page index
// that resets with the filter. The reset happens during render, so nothing
// paints the stale value, unlike `useEffect(() => setPage(0), [query])`.
// `key` is a string so several inputs can join into one.
export function useResetOnChange<T>(key: string, initial: T) {
  const [value, setValue] = useState(initial)
  const [seenKey, setSeenKey] = useState(key)
  if (seenKey !== key) {
    setSeenKey(key)
    setValue(initial)
  }
  return [value, setValue] as const
}
