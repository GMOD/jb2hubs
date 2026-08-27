import '../styles/ui.css'

import type { ReactNode } from 'react'

// Native <dialog> so Escape and focus trapping come from the platform; the
// callback ref opens it on mount, since the element only exists while the caller
// renders it. Click-away is the one thing the platform does not give: a backdrop
// click targets the <dialog> itself, so a click whose target is the element
// rather than anything inside it is a click outside the panel.
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <dialog
      className="ui-dialog"
      ref={el => {
        // showModal() throws if the dialog is already open, which a StrictMode
        // ref re-attach would do.
        if (el && !el.open) {
          el.showModal()
        }
      }}
      onClick={e => {
        if (e.target === e.currentTarget) {
          e.currentTarget.close()
        }
      }}
      onClose={() => {
        onClose()
      }}
    >
      <h2>{title}</h2>
      {children}
      <form method="dialog">
        <button className="ui-btn-secondary">Close</button>
      </form>
    </dialog>
  )
}
