import '../styles/ui.css'

import { useId } from 'react'

import type { ReactNode } from 'react'

// Native <dialog> so Escape and focus trapping come from the platform; the
// callback ref opens it on mount, since the element only exists while the caller
// renders it. Click-away is the one thing the platform does not give. A backdrop
// click targets the <dialog> itself, but so does a click in its own padding, so
// only a click outside the dialog's box closes it.
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <dialog
      className="ui-dialog"
      aria-labelledby={titleId}
      ref={el => {
        // showModal() throws if the dialog is already open, which a StrictMode
        // ref re-attach would do.
        if (el && !el.open) {
          el.showModal()
        }
      }}
      onClick={e => {
        const box = e.currentTarget.getBoundingClientRect()
        const outside =
          e.clientX < box.left ||
          e.clientX > box.right ||
          e.clientY < box.top ||
          e.clientY > box.bottom
        if (e.target === e.currentTarget && outside) {
          e.currentTarget.close()
        }
      }}
      onClose={() => {
        onClose()
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
      <form method="dialog">
        <button className="ui-btn-secondary">Close</button>
      </form>
    </dialog>
  )
}
