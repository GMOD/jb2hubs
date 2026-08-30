import { useState } from 'react'

/**
 * State that goes back to `initial` whenever `key` changes: a page index that
 * should return to the first page when the filter changes, a highlighted option
 * that should return to the top when the query does.
 *
 * The reset happens during render rather than in an effect. React re-runs the
 * component with the new state before committing anything, so nothing is
 * painted with the stale value -- whereas `useEffect(() => setPage(0), [query])`
 * commits one render showing page 7 of a result set that now has two pages, then
 * corrects itself. The oxlint rule that flags the effect form
 * (`react/set-state-in-effect`) is naming that extra render, not being pedantic.
 *
 * `key` is a string so several inputs can be joined into one; a separator that
 * cannot appear in the values keeps two of them from colliding, and the cost of
 * a collision is only a reset that does not happen.
 */
export function useResetOnChange<T>(key: string, initial: T) {
  const [value, setValue] = useState(initial)
  const [seenKey, setSeenKey] = useState(key)
  if (seenKey !== key) {
    setSeenKey(key)
    setValue(initial)
  }
  return [value, setValue] as const
}
