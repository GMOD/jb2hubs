import '../styles/ui.css'

import { useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useCombobox } from '../hooks/useCombobox.ts'
import { useDebouncedValue } from '../hooks/useDebouncedValue.ts'
import { LIVE_QUERY } from '../lib/swr.ts'

// A gene-symbol box with suggestions. Deliberately free-text: Enter submits what
// was typed unless a suggestion is highlighted, so a symbol the type-ahead has
// not heard of (or has not answered for yet) still runs. The suggestions are a
// convenience; the lookup behind the box decides whether the gene exists.
// `suggest` must keep its identity across renders (`taxonSymbols`,
// `indexSymbols`), since a new one looks the text up again.
export default function GeneCombobox({
  id,
  name,
  value,
  suggest,
  disabled,
  required,
  placeholder = 'Gene symbol, e.g. TP53',
  onChange,
  onSubmit,
}: {
  // a box with an id is named by the <label htmlFor> that points at it
  id?: string
  name?: string
  value: string
  suggest: (query: string) => Promise<string[]>
  disabled?: boolean
  required?: boolean
  placeholder?: string
  onChange: (v: string) => void
  onSubmit: (v: string) => void
}) {
  // what the user typed, as opposed to a symbol put in the box by a chip or a
  // species switch — only typing should fire a lookup
  const [typed, setTyped] = useState('')

  // A query too short to look up has no suggestions, and so does a box whose
  // value came from outside — a chip or a species switch puts a symbol in the
  // box without going through `typed`, so the last typed lookup no longer
  // describes what is shown. Both are facts about (`typed`, `value`) rather
  // than state to clear. Asked once the text holds still, and shown only for
  // exactly the text in the box.
  // A locstring is no symbol, and the pangenome box takes either.
  const settled = useDebouncedValue(typed.trim(), 220)
  const lookup = settled.length >= 2 && !settled.includes(':')
  const { data } = useSWRImmutable(
    lookup ? ['gene-suggest', suggest, settled] : null,
    ([, ask, query]) => ask(query),
    LIVE_QUERY,
  )
  const hits =
    lookup && value === typed && settled === typed.trim() ? (data ?? []) : []

  // A new set of suggestions starts with none highlighted, so Enter runs what
  // was typed until an arrow key picks one.
  const [open, setOpen] = useState(false)
  const { highlighted, setHighlighted, listboxId, optionId, onKeyDown } =
    useCombobox({
      open,
      setOpen,
      optionCount: hits.length,
      resetKey: hits.join('\n'),
      initialHighlight: -1,
      onPick: index => {
        choose(hits[index] ?? value)
      },
    })

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
        id={id}
        name={name}
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
        aria-label={id ? undefined : placeholder}
        disabled={disabled}
        required={required}
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
