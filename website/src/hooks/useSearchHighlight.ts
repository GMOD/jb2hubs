import { useEffect, useLayoutEffect, useState } from 'react'

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

// Returns a callback ref to put on the element whose text should be highlighted.
// A ref object would not work: the results table is mounted conditionally, so on
// a search page that currently shows nothing the ref is still null when the
// effect runs, and only a change to `query` would run it again. Filtering from
// zero matches back to some (clearing a clade, unticking "reference only") keeps
// the query identical, so the table would mount unhighlighted and stay that way.
// A callback ref makes the node itself a dependency, so mounting re-attaches.
export function useSearchHighlight(query: string) {
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useIsomorphicLayoutEffect(() => {
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
  }, [container, query])

  // A useState setter is referentially stable, so React never detaches and
  // re-attaches this ref on a re-render.
  return setContainer
}
