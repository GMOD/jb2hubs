import { useEffect, useState } from 'react'

// `value` once it has held still for `ms`, so a lookup keyed on it asks once
// per pause in typing rather than once per keystroke.
export function useDebouncedValue<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value)
    }, ms)
    return () => {
      clearTimeout(timer)
    }
  }, [value, ms])
  return settled
}
