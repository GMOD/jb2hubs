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
