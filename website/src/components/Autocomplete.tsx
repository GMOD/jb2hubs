import { useEffect, useRef, useState } from 'react'

import { useCombobox } from '../hooks/useCombobox.ts'
import { rankOptions } from '../utils/rankOptions.ts'

export interface AutocompleteOption {
  value: string
  label: string
}

// What an async backend answered for one search. A rejection is shown the same
// way as an `error`, so an outage does not read as "no results".
export interface QueryAnswer {
  options: AutocompleteOption[]
  error?: string
}

interface Props {
  // Static option list (fuzzy-ranked locally). Omit when using queryOptions.
  options?: AutocompleteOption[]
  // Database-like async backend: given the current search string, returns the
  // ranked options to show. Its identity is the backend's, so a caller keeps it
  // stable (useCallback): a new function asks again.
  queryOptions?: (search: string) => Promise<QueryAnswer>
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
}

function ClearIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  )
}

export default function Autocomplete({
  options = [],
  queryOptions,
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  id,
}: Props) {
  const [inputValue, setInputValue] = useState('')
  const [answered, setAnswered] = useState<QueryAnswer & { search: string }>()
  // Remembers the picked option so async mode can label the input without the
  // selection necessarily being in the latest query results.
  const [pickedOption, setPickedOption] = useState<AutocompleteOption | null>(
    null,
  )
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption =
    pickedOption?.value === value
      ? pickedOption
      : options.find(o => o.value === value)

  // Async (adapter) mode shows the backend's answer for exactly the text in the
  // box, and nothing while that answer is on its way, so Enter cannot pick from
  // the previous search's list. Static mode runs the shared ranked + capped
  // fuzzy match locally, so a thousand-gene list ranks the best symbol first
  // instead of dumping every hit in source order.
  const answer =
    queryOptions && answered?.search === inputValue ? answered : undefined
  const searching = queryOptions !== undefined && answer === undefined
  const filteredOptions = queryOptions
    ? (answer?.options ?? [])
    : rankOptions(inputValue, options)

  const close = () => {
    setInputValue('')
  }

  const pick = (option: AutocompleteOption) => {
    setPickedOption(option)
    onChange(option.value)
    close()
  }

  const combobox = useCombobox({
    optionCount: filteredOptions.length,
    resetKey: inputValue,
    onPick: index => {
      const option = filteredOptions[index]
      if (option) {
        pick(option)
      }
    },
    onClose: close,
  })
  const { open, setOpen, highlighted, setHighlighted, listboxId, optionId } =
    combobox
  const showList = open && !disabled

  // Debounced, and a slow earlier answer, success or failure, never lands on a
  // newer one. Runs whenever the list is open, so focusing the box asks the
  // backend for its default (empty-query) list.
  useEffect(() => {
    if (!queryOptions || !showList) {
      return
    }
    let ignore = false
    const search = inputValue
    const timer = setTimeout(() => {
      void queryOptions(search).then(
        res => {
          if (!ignore) {
            setAnswered({ search, ...res })
          }
        },
        (e: unknown) => {
          if (!ignore) {
            setAnswered({
              search,
              options: [],
              error: e instanceof Error ? e.message : String(e),
            })
          }
        },
      )
    }, 220)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [queryOptions, inputValue, showList])

  return (
    <div className="autocomplete">
      <div
        className={`autocomplete-input-wrapper${disabled ? ' disabled' : ''}`}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={open ? inputValue : (selectedOption?.label ?? '')}
          onChange={e => {
            setInputValue(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
          }}
          // An option's mousedown prevents default below, so picking one never
          // blurs the box; anything else that takes focus closes the list.
          onBlur={() => {
            setOpen(false)
            close()
          }}
          onKeyDown={e => {
            combobox.onKeyDown(e)
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && filteredOptions.length > 0
              ? optionId(highlighted)
              : undefined
          }
          className="autocomplete-input"
        />
        {value && !disabled && (
          <button
            type="button"
            className="autocomplete-clear"
            onClick={() => {
              setPickedOption(null)
              onChange('')
              close()
              inputRef.current?.focus()
            }}
            tabIndex={-1}
            aria-label="Clear"
          >
            <ClearIcon />
          </button>
        )}
      </div>
      {showList && (
        <ul
          id={listboxId}
          className="autocomplete-list"
          role="listbox"
          aria-busy={searching}
        >
          {searching ? (
            <li className="autocomplete-no-results">Searching…</li>
          ) : answer?.error ? (
            <li className="autocomplete-no-results">
              Search failed ({answer.error})
            </li>
          ) : filteredOptions.length === 0 ? (
            <li className="autocomplete-no-results">No results found</li>
          ) : (
            filteredOptions.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === highlighted}
                className={`autocomplete-option ${index === highlighted ? 'highlighted' : ''} ${option.value === value ? 'selected' : ''}`}
                // A callback ref runs on every render of the highlighted row,
                // which is exactly when it may have moved out of view.
                ref={
                  index === highlighted
                    ? el => {
                        el?.scrollIntoView({ block: 'nearest' })
                      }
                    : undefined
                }
                onMouseDown={e => {
                  e.preventDefault()
                  pick(option)
                  setOpen(false)
                }}
                onMouseEnter={() => {
                  setHighlighted(index)
                }}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
