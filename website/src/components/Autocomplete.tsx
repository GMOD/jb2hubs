import React, { useEffect, useRef, useState } from 'react'

import { rankOptions } from '../utils/rankOptions.ts'

export interface AutocompleteOption {
  value: string
  label: string
}

interface Props {
  // Static option list (fuzzy-ranked locally). Omit when using queryOptions.
  options?: AutocompleteOption[]
  // Database-like async backend: given the current search string, returns the
  // ranked options to show. Lets a data adapter (e.g. the ortholog adapter)
  // own all the querying, keeping this component presentational.
  queryOptions?: (search: string) => Promise<AutocompleteOption[]>
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
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [asyncResults, setAsyncResults] = useState<AutocompleteOption[]>([])
  // Remembers the picked option so async mode can label the input without the
  // selection necessarily being in the latest query results.
  const [pickedOption, setPickedOption] = useState<AutocompleteOption | null>(
    null,
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // Discards out-of-order async query responses.
  const queryIdRef = useRef(0)

  const selectedOption =
    pickedOption?.value === value
      ? pickedOption
      : options.find(o => o.value === value)

  // Async (adapter) mode shows whatever the backend returned; static mode runs
  // the shared ranked + capped fuzzy match locally, so a thousand-gene list
  // ranks the best symbol first instead of dumping every hit in source order.
  const filteredOptions = queryOptions
    ? asyncResults
    : rankOptions(inputValue, options)

  const runQuery = (search: string) => {
    if (queryOptions) {
      const id = ++queryIdRef.current
      void queryOptions(search).then(res => {
        if (id === queryIdRef.current) {
          setAsyncResults(res)
        }
      })
    }
  }

  useEffect(() => {
    setHighlightedIndex(0)
  }, [inputValue])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        setInputValue('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.children.item(highlightedIndex)
      if (highlighted instanceof HTMLElement) {
        highlighted.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    if (!isOpen) {
      setIsOpen(true)
    }
    runQuery(e.target.value)
  }

  const handleSelect = (option: AutocompleteOption) => {
    setPickedOption(option)
    onChange(option.value)
    setIsOpen(false)
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
      } else {
        setHighlightedIndex(i => Math.min(i + 1, filteredOptions.length - 1))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filteredOptions.at(highlightedIndex)
      if (isOpen && opt) {
        handleSelect(opt)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setInputValue('')
    }
  }

  const handleFocus = () => {
    setIsOpen(true)
    runQuery(inputValue)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPickedOption(null)
    onChange('')
    setInputValue('')
    inputRef.current?.focus()
  }

  return (
    <div
      className="autocomplete"
      ref={containerRef}
    >
      <div
        className={`autocomplete-input-wrapper${disabled ? ' disabled' : ''}`}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={isOpen ? inputValue : (selectedOption?.label ?? '')}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="autocomplete-input"
        />
        {value && !disabled && (
          <button
            type="button"
            className="autocomplete-clear"
            onClick={handleClear}
            tabIndex={-1}
            aria-label="Clear"
          >
            <ClearIcon />
          </button>
        )}
      </div>
      {isOpen && !disabled && (
        <ul
          className="autocomplete-list"
          ref={listRef}
        >
          {filteredOptions.length === 0 ? (
            <li className="autocomplete-no-results">No results found</li>
          ) : (
            filteredOptions.map((option, index) => (
              <li
                key={option.value}
                className={`autocomplete-option ${index === highlightedIndex ? 'highlighted' : ''} ${option.value === value ? 'selected' : ''}`}
                onClick={() => {
                  handleSelect(option)
                }}
                onMouseEnter={() => {
                  setHighlightedIndex(index)
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
