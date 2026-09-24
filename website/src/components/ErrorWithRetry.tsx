import '../styles/ui.css'

import { errorText } from './ErrorMessage.tsx'

// An error line with a way past it, for a fetch the reader cannot re-trigger by
// asking again: an SWR key does not change when the same query is resubmitted,
// and the live queries do not retry on their own (LIVE_QUERY), so without this
// the only way past a transient failure was a reload. `onRetry` is usually the
// hook's `mutate`; `context` says what failed to load, for an error whose own
// text is only a status line. Renders nothing when there is no error.
export default function ErrorWithRetry({
  error,
  onRetry,
  className,
  context,
  buttonClassName = 'ui-linkbtn',
}: {
  error: unknown
  onRetry: () => void
  className: string
  context?: string
  buttonClassName?: string
}) {
  return error ? (
    <p className={className}>
      {context ? `${context} (${errorText(error)}).` : errorText(error)}{' '}
      <button
        type="button"
        className={buttonClassName}
        onClick={() => {
          onRetry()
        }}
      >
        Retry
      </button>
    </p>
  ) : null
}
