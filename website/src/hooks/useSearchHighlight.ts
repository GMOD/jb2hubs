import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

const HIGHLIGHT_NAME = 'search-result'

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
  useLayoutEffect(() => {
    const container = containerRef.current
    if (container) {
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
