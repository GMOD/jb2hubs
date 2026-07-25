import { useEffect, useMemo, useRef, useState } from 'react'

import styles from './HeaderSearch.module.css'
import { entryHref } from './searchScoring.ts'
import {
  MIN_SUGGEST_LENGTH,
  suggestEntries,
  suggestionMeta,
  suggestionTitle,
} from './searchSuggestions.ts'
import { useSearchIndex } from '../hooks/useSearchIndex.ts'

const LISTBOX_ID = 'header-search-listbox'

export default function HeaderSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  // The index is several megabytes; nothing downloads it until the user focuses
  // the box, so the other pages on the site are unaffected by this being in the
  // header of every one of them.
  const [engaged, setEngaged] = useState(false)
  // -1 means "no suggestion picked", which is what makes Enter run the full
  // search rather than jumping to whichever assembly happens to rank first.
  const [highlighted, setHighlighted] = useState(-1)
  const { index, loading } = useSearchIndex(engaged)
  const formRef = useRef<HTMLFormElement>(null)

  // Renders on the server with an empty box, so the query comes from the URL
  // after hydration. Keeps the header in sync with the search page it submitted
  // to, and with any /search?q=… link someone arrives on.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q) {
      setQuery(q)
    }
  }, [])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [])

  const suggestions = useMemo(
    () => suggestEntries(index, query),
    [index, query],
  )

  const trimmed = query.trim()
  const showList = open && trimmed.length >= MIN_SUGGEST_LENGTH
  // Not suggestions.at(highlighted): -1 means nothing is picked, and .at(-1)
  // would hand back the last suggestion.
  const active = highlighted >= 0 ? suggestions[highlighted] : undefined

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlighted(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      // Only an arrowed-to suggestion hijacks Enter; otherwise the form submits
      // to /search normally, which is also the no-JS path.
      if (showList && active) {
        e.preventDefault()
        window.location.assign(entryHref(active))
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
    }
  }

  return (
    <form
      ref={formRef}
      className={styles.form}
      action="/search"
      method="get"
      role="search"
    >
      <label
        className={styles.visuallyHidden}
        htmlFor="header-search-input"
      >
        Search genomes
      </label>
      <svg
        className={styles.icon}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle
          cx="11"
          cy="11"
          r="8"
        />
        <line
          x1="21"
          y1="21"
          x2="16.65"
          y2="16.65"
        />
      </svg>
      <input
        id="header-search-input"
        className={styles.input}
        type="search"
        name="q"
        value={query}
        placeholder="Search genomes…"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={LISTBOX_ID}
        aria-autocomplete="list"
        aria-activedescendant={
          active ? `header-search-option-${highlighted}` : undefined
        }
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlighted(-1)
        }}
        onFocus={() => {
          setEngaged(true)
          setOpen(true)
        }}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul
          id={LISTBOX_ID}
          className={styles.list}
          role="listbox"
        >
          {suggestions.map((entry, i) => (
            <li
              key={`${entry[5]}-${entry[0]}`}
              id={`header-search-option-${i}`}
              role="option"
              aria-selected={i === highlighted}
            >
              <a
                className={
                  i === highlighted
                    ? `${styles.option} ${styles.on}`
                    : styles.option
                }
                href={entryHref(entry)}
                onMouseEnter={() => {
                  setHighlighted(i)
                }}
              >
                <span className={styles.title}>{suggestionTitle(entry)}</span>
                <span className={styles.meta}>{suggestionMeta(entry)}</span>
              </a>
            </li>
          ))}
          {suggestions.length === 0 && (
            <li className={styles.empty}>
              {loading ? 'Loading…' : `No genomes match “${trimmed}”`}
            </li>
          )}
          <li>
            <button
              type="submit"
              className={styles.allResults}
            >
              See all results for “{trimmed}”
            </button>
          </li>
        </ul>
      )}
    </form>
  )
}
