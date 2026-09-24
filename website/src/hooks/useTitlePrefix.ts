import { useEffect } from 'react'

// Puts `prefix` in front of the page's own title while it is set and restores
// the title when it is cleared, so a tab or a bookmark of a result names it:
// "TP53 · Ortholog explorer" rather than the page's name alone.
export function useTitlePrefix(prefix: string | undefined) {
  useEffect(() => {
    if (prefix) {
      const original = document.title
      document.title = `${prefix} · ${original}`
      return () => {
        document.title = original
      }
    }
  }, [prefix])
}
