import { loadJsonOnce } from '../lib/fetchJson.ts'
import { SEARCH_INDEX_URL } from '../lib/searchIndex.ts'
import { entryHref } from './searchScoring.ts'
import {
  MIN_SUGGEST_LENGTH,
  suggestEntries,
  suggestionMeta,
  suggestionTitle,
} from './searchSuggestions.ts'

import type { IndexEntry } from '../lib/searchIndex.ts'

// The typeahead is on all 125K pages, and hydrating it as a React island cost
// 210KB of JS per page view — react-dom alone was 178KB — to decorate a form
// that already works as a plain GET to /search. This is the same behaviour
// written against the DOM, sharing the ranking and formatting helpers with the
// /search page, which is still React because it is a real application view.

const OPTION_ID_PREFIX = 'header-search-option-'

export function initHeaderSearch() {
  const form = document.querySelector('.header-search')
  const input = document.getElementById('header-search-input')
  const list = document.getElementById('header-search-listbox')
  if (
    form instanceof HTMLFormElement &&
    input instanceof HTMLInputElement &&
    list instanceof HTMLElement
  ) {
    attach(form, input, list)
  }
}

function attach(
  form: HTMLFormElement,
  input: HTMLInputElement,
  list: HTMLElement,
) {
  // The index is several megabytes; nothing downloads it until the user focuses
  // the box, so the other pages on the site are unaffected by this being in the
  // header of every one of them. loadJsonOnce is also what useSearchIndex
  // fetches through, so the /search page and this box share one download.
  let index: IndexEntry[] = []
  let loading = false
  let engaged = false
  let open = false
  // -1 means "no suggestion picked", which is what makes Enter run the full
  // search rather than jumping to whichever assembly happens to rank first.
  let highlighted = -1
  let suggestions: IndexEntry[] = []
  let options: HTMLAnchorElement[] = []

  // Rendered on the server with an empty box, so the query comes from the URL
  // here. Keeps the header in sync with the search page it submitted to, and
  // with any /search?q=… link someone arrives on.
  const initial = new URLSearchParams(window.location.search).get('q')
  if (initial) {
    input.value = initial
  }

  const shown = () => open && input.value.trim().length >= MIN_SUGGEST_LENGTH

  // Highlight moves are a class toggle rather than a re-render: rebuilding the
  // rows under the pointer would re-fire the mouseenter that asked for the move.
  const paintHighlight = () => {
    for (const [i, option] of options.entries()) {
      option.classList.toggle('on', i === highlighted)
      option.parentElement?.setAttribute(
        'aria-selected',
        String(i === highlighted),
      )
    }
    if (highlighted >= 0) {
      input.setAttribute(
        'aria-activedescendant',
        `${OPTION_ID_PREFIX}${highlighted}`,
      )
    } else {
      input.removeAttribute('aria-activedescendant')
    }
  }

  const optionRow = (entry: IndexEntry, i: number) => {
    const li = document.createElement('li')
    li.id = `${OPTION_ID_PREFIX}${i}`
    li.setAttribute('role', 'option')
    li.setAttribute('aria-selected', 'false')

    const anchor = document.createElement('a')
    anchor.className = 'header-search-option'
    anchor.href = entryHref(entry)
    anchor.addEventListener('mouseenter', () => {
      if (highlighted !== i) {
        highlighted = i
        paintHighlight()
      }
    })

    const title = document.createElement('span')
    title.className = 'header-search-title'
    title.textContent = suggestionTitle(entry)

    const meta = document.createElement('span')
    meta.className = 'header-search-meta'
    meta.textContent = suggestionMeta(entry)

    anchor.append(title, meta)
    li.append(anchor)
    options.push(anchor)
    return li
  }

  const messageRow = (text: string) => {
    const li = document.createElement('li')
    li.className = 'header-search-empty'
    li.textContent = text
    return li
  }

  const allResultsRow = (trimmed: string) => {
    const li = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'submit'
    button.className = 'header-search-all'
    button.textContent = `See all results for “${trimmed}”`
    li.append(button)
    return li
  }

  const render = () => {
    const trimmed = input.value.trim()
    const show = shown()
    input.setAttribute('aria-expanded', String(show))
    list.hidden = !show
    options = []
    if (show) {
      const rows: HTMLElement[] = []
      for (const [i, entry] of suggestions.entries()) {
        rows.push(optionRow(entry, i))
      }
      if (suggestions.length === 0) {
        rows.push(
          messageRow(loading ? 'Loading…' : `No genomes match “${trimmed}”`),
        )
      }
      rows.push(allResultsRow(trimmed))
      list.replaceChildren(...rows)
    } else {
      list.replaceChildren()
    }
    paintHighlight()
  }

  const requery = () => {
    suggestions = suggestEntries(index, input.value)
    render()
  }

  input.addEventListener('focus', () => {
    open = true
    if (!engaged) {
      engaged = true
      loading = true
      loadJsonOnce<IndexEntry[]>(SEARCH_INDEX_URL)
        .then(data => {
          index = data
          loading = false
          requery()
        })
        .catch(() => {
          loading = false
          render()
        })
    }
    render()
  })

  input.addEventListener('input', () => {
    open = true
    highlighted = -1
    requery()
  })

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      // Rebuild only when the arrow is what opened the list: rebuilding while it
      // is already up would re-fire mouseenter under a resting pointer and steal
      // the selection back.
      const wasShown = shown()
      open = true
      highlighted = Math.min(highlighted + 1, suggestions.length - 1)
      if (wasShown) {
        paintHighlight()
      } else {
        render()
      }
    } else if (e.key === 'ArrowUp') {
      // Only while the list is up. Unconditionally preventing default would eat
      // the keystroke in a closed box, where ArrowUp is the browser's own "jump
      // to the start of the input" and nothing here has a use for it.
      if (shown()) {
        e.preventDefault()
        highlighted = Math.max(highlighted - 1, -1)
        paintHighlight()
      }
    } else if (e.key === 'Enter') {
      // Only an arrowed-to suggestion hijacks Enter; otherwise the form submits
      // to /search normally, which is also the no-JS path.
      const active = highlighted >= 0 ? suggestions[highlighted] : undefined
      if (shown() && active) {
        e.preventDefault()
        window.location.assign(entryHref(active))
      }
    } else if (e.key === 'Escape') {
      open = false
      highlighted = -1
      render()
    }
  })

  document.addEventListener('mousedown', e => {
    if (e.target instanceof Node && !form.contains(e.target)) {
      open = false
      render()
    }
  })
}
