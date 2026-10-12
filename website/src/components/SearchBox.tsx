import { Search, X } from 'lucide-react'

import styles from './SearchBox.module.css'

interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
  disabled?: boolean
  autoFocus?: boolean
}

export default function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  disabled,
  autoFocus,
}: SearchBoxProps) {
  return (
    <div className={styles.wrapper}>
      <Search
        size={16}
        className={styles.icon}
      />
      <input
        type="text"
        value={value}
        onChange={e => {
          onChange(e.target.value)
        }}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        className={styles.input}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
          }}
          className={styles.clear}
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
