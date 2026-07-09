// Typed JSON fetch for SWR fetchers and one-off loads: throws on a non-2xx so the
// caller (or SWR's `error`) sees the failure instead of parsing an error body.
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// Fetch + parse a JSON asset at most once per URL, sharing the in-flight/resolved
// promise across callers. A rejected load is evicted rather than cached, so a
// later call retries instead of replaying the failure. For non-SWR one-off loads
// (module-level lazy caches); SWR callers should use fetchJson directly.
const jsonCache = new Map<string, Promise<unknown>>()

export function loadJsonOnce<T>(url: string): Promise<T> {
  const cached = jsonCache.get(url)
  const promise =
    cached ??
    fetchJson<T>(url).catch((e: unknown) => {
      jsonCache.delete(url)
      throw e
    })
  jsonCache.set(url, promise)
  return promise as Promise<T>
}
