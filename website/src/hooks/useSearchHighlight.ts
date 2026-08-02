import { useEffect, useLayoutEffect } from 'react'
import type { RefObject } from 'react'

const HIGHLIGHT_NAME = 'search-result'

// These tables are server-rendered before they hydrate, and React warns that a
// layout effect does nothing on the server. There is nothing to highlight there
// either, so the server render just gets the no-op.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

// The CSS Custom Highlight API is missing on Firefox before 140 and Safari
// before 17.2, where `new Highlight()` is a ReferenceError. Thrown from a layout
// effect that would take the whole React root down with it — a search page that
// renders nothing rather than one without yellow marks — so the highlight is
// treated as the progressive enhancement it is.
const SUPPORTED =
  typeof Highlight !== 'undefined' &&
  typeof CSS !== 'undefined' &&
  !!CSS.highlights

function applyHighlight(container: Element, query: string) {
  const highlight = new Highlight()
  if (query.trim()) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = (node.textContent ?? '').toLowerCase()
      for (const term of terms) {
        let idx = text.indexOf(term)
        while (idx !== -1) {
          const range = new Range()
          range.setStart(node, idx)
          range.setEnd(node, idx + term.length)
          highlight.add(range)
          idx = text.indexOf(term, idx + term.length)
        }
      }
    }
  }
  CSS.highlights.set(HIGHLIGHT_NAME, highlight)
}

export function useSearchHighlight(
  containerRef: RefObject<HTMLElement | null>,
  query: string,
) {
  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current
    if (SUPPORTED && container) {
      applyHighlight(container, query)
      const observer = new MutationObserver(() => {
        applyHighlight(container, query)
      })
      observer.observe(container, { childList: true, subtree: true })
      return () => {
        observer.disconnect()
        CSS.highlights.delete(HIGHLIGHT_NAME)
      }
    }
  }, [query])
}
