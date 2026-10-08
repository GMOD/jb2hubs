import '../styles/ui.css'

import { useEffect, useState } from 'react'

import { useCombobox } from '../hooks/useCombobox.ts'
import { searchGenes } from './geneSearch.ts'

// A gene-symbol box with suggestions. Deliberately free-text: Enter submits what
// was typed unless a suggestion is highlighted, so a symbol the type-ahead has
// not heard of (or has not answered for yet) still runs. The suggestions are a
// convenience; NCBI decides whether the gene exists.
export default function GeneCombobox({
  value,
  taxId,
  disabled,
  placeholder = 'Gene symbol, e.g. TP53',
  onChange,
  onSubmit,
}: {
  value: string
  taxId: number
  disabled: boolean
  placeholder?: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
}) {
  const [fetchedHits, setFetchedHits] = useState<string[]>([])
  // what the user typed, as opposed to a symbol put in the box by a chip or a
  // species switch — only typing should fire a lookup
  const [typed, setTyped] = useState('')

  // A query too short to look up has no suggestions, and so does a box whose
  // value came from outside — a chip or a species switch puts a symbol in the
  // box without going through `typed`, so the last typed lookup no longer
  // describes what is shown. Both are facts about (`typed`, `value`) rather
  // than state to clear: derived here so the effect does the one thing it is
  // for, which is fetching.
  // A locstring is no symbol, and the pangenome box takes either.
  const lookup = typed.trim().length >= 2 && !typed.includes(':')
  const hits = !lookup || value !== typed ? [] : fetchedHits

  // A new set of suggestions starts with none highlighted, so Enter runs what
  // was typed until an arrow key picks one.
  const {
    open,
    setOpen,
    highlighted,
    setHighlighted,
    listboxId,
    optionId,
    onKeyDown,
  } = useCombobox({
    optionCount: hits.length,
    resetKey: hits.join('\n'),
    initialHighlight: -1,
    onPick: index => {
      choose(hits[index] ?? value)
    },
  })

  // Debounced and race-safe: the cleanup drops a slow earlier response so it
  // cannot land on top of a newer one.
  useEffect(() => {
    if (!lookup) {
      return
    }
    let ignore = false
    const timer = setTimeout(() => {
      void searchGenes(typed.trim(), taxId).then(found => {
        // set even when empty, so a no-match query clears stale suggestions
        if (!ignore) {
          setFetchedHits(found.map(h => h.symbol))
        }
      })
    }, 220)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [typed, taxId, lookup])

  function choose(symbol: string) {
    onChange(symbol)
    setTyped('')
    setOpen(false)
    onSubmit(symbol)
  }

  const showList = open && hits.length > 0 && !disabled

  return (
    <div className="ui-combobox">
      <input
        className="ui-input"
        value={value}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && highlighted >= 0 ? optionId(highlighted) : undefined
        }
        autoComplete="off"
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        onChange={e => {
          onChange(e.target.value)
          setTyped(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
        }}
        // An option's mousedown prevents default below, so picking one never
        // blurs the box; anything else that takes focus closes the list.
        onBlur={() => {
          setOpen(false)
        }}
        onKeyDown={e => {
          onKeyDown(e)
          // Enter with nothing highlighted submits the box as typed.
          if (
            e.key === 'Enter' &&
            !e.nativeEvent.isComposing &&
            !e.isDefaultPrevented()
          ) {
            e.preventDefault()
            choose(value)
          }
        }}
      />
      {showList && (
        <ul
          className="ui-listbox"
          id={listboxId}
          role="listbox"
        >
          {hits.map((symbol, i) => (
            <li
              key={symbol}
              id={optionId(i)}
              role="option"
              aria-selected={i === highlighted}
              className={
                i === highlighted ? 'ui-option highlighted' : 'ui-option'
              }
              onMouseEnter={() => {
                setHighlighted(i)
              }}
              onMouseDown={e => {
                e.preventDefault()
                choose(symbol)
              }}
            >
              {symbol}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
