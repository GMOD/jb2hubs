// SWR types `error` as unknown, and every caller wants the same thing out of it:
// one line of text. Exported separately for the (rare) caller that needs the
// string rather than the element.
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// Renders nothing when there is no error, so callers can drop it in unguarded.
export default function ErrorMessage({
  error,
  className,
}: {
  error: unknown
  className: string
}) {
  return error ? <p className={className}>{errorText(error)}</p> : null
}
