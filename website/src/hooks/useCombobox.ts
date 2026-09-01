import { useId, useState } from 'react'

import { useResetOnChange } from './useResetOnChange.ts'

import type { KeyboardEvent } from 'react'

// The open/highlight state and keyboard handling every combobox on the site
// repeats, plus the ids that tie the input to its listbox for aria-controls and
// aria-activedescendant. useId keeps two id-less instances on one page (the
// synteny pair) from sharing option ids.
//
// `resetKey` is whatever change should send the highlight back to
// `initialHighlight` — the query text, usually. `onPick` gets the highlighted
// index on Enter, after which the list closes; `onClose` runs on Escape after
// the list closes.
export function useCombobox({
  optionCount,
  resetKey,
  initialHighlight = 0,
  onPick,
  onClose,
}: {
  optionCount: number
  resetKey: string
  initialHighlight?: number
  onPick: (index: number) => void
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useResetOnChange(
    resetKey,
    initialHighlight,
  )
  const listboxId = useId()
  const optionId = (index: number) => `${listboxId}-option-${index}`

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
      } else if (optionCount > 0) {
        setHighlighted(i => Math.min(i + 1, optionCount - 1))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(i => Math.max(i - 1, initialHighlight))
    } else if (e.key === 'Enter') {
      if (open && highlighted >= 0 && highlighted < optionCount) {
        e.preventDefault()
        onPick(highlighted)
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      onClose?.()
    }
  }

  return {
    open,
    setOpen,
    highlighted,
    setHighlighted,
    listboxId,
    optionId,
    onKeyDown,
  }
}
