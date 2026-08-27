import '../styles/ui.css'

// The `?` that opens a tool page's help dialog. Its own component because the
// label, the title and the aria-label have to agree, and the two pages that had
// one had each written it separately — same markup, two different shapes.
export default function HelpButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="ui-btn-help"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      ?
    </button>
  )
}
