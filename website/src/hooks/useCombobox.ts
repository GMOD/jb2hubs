import { useId, useState } from 'react'

import type { KeyboardEvent, SetStateAction } from 'react'

// The highlight state and keyboard handling every combobox on the site
// repeats, plus the ids that tie the input to its listbox for aria-controls and
// aria-activedescendant. useId keeps two id-less instances on one page (the
// synteny pair) from sharing option ids.
//
// `resetKey` is whatever change should send the highlight back to
// `initialHighlight` — the query text, usually. `onPick` gets the highlighted
// index on Enter, after which the list closes; `onClose` runs on Escape after
// the list closes. The caller owns `open`, since what it asks a backend can
// depend on whether the list is showing.
export function useCombobox({
  open,
  setOpen,
  optionCount,
  resetKey,
  initialHighlight = 0,
  onPick,
  onClose,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  optionCount: number
  resetKey: string
  initialHighlight?: number
  onPick: (index: number) => void
  onClose?: () => void
}) {
  // A highlight belongs to the resetKey it was set under, so new text starts
  // from initialHighlight without a reset.
  const [highlight, setHighlight] = useState({
    key: resetKey,
    index: initialHighlight,
  })
  const highlighted =
    highlight.key === resetKey ? highlight.index : initialHighlight
  const setHighlighted = (update: SetStateAction<number>) => {
    setHighlight(h => {
      const current = h.key === resetKey ? h.index : initialHighlight
      return {
        key: resetKey,
        index: typeof update === 'function' ? update(current) : update,
      }
    })
  }
  const listboxId = useId()
  const optionId = (index: number) => `${listboxId}-option-${index}`

  const onKeyDown = (e: KeyboardEvent) => {
    // Keys pressed while an input method composes a character are its own.
    if (e.nativeEvent.isComposing) {
      return
    }
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
    highlighted,
    setHighlighted,
    listboxId,
    optionId,
    onKeyDown,
  }
}
