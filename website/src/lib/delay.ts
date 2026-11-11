// Waits `ms`, or rejects with the signal's reason as soon as it fires.
export async function delay(ms: number, signal?: AbortSignal) {
  signal?.throwIfAborted()
  await new Promise<void>(resolve => {
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
  signal?.throwIfAborted()
}

// `work`'s answer, or a TimeoutError naming `what` once `ms` pass without one.
// `work` is not cancelled; its late answer is dropped.
export function within<T>(work: Promise<T>, ms: number, what: string) {
  return Promise.race([
    work,
    delay(ms).then(() => {
      throw new DOMException(
        `${what} gave no answer in ${ms / 1000} s`,
        'TimeoutError',
      )
    }),
  ])
}
