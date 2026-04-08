import React, { useEffect, useRef, useState } from 'react'

export interface AutocompleteOption {
  value: string
  label: string
}

interface Props {
  options: AutocompleteOption[]
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
  options,
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  id,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedOption = options.find(o => o.value === value)

  const filteredOptions = inputValue
    ? options.filter(o =>
        o.label.toLowerCase().includes(inputValue.toLowerCase()),
      )
    : options

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
  }

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
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
        handleSelect(opt.value)
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
      setInputValue('')
    }
  }

  const handleFocus = () => {
    setIsOpen(true)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
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
                  handleSelect(option.value)
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
