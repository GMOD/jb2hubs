// Typed JSON fetch for SWR fetchers and one-off loads: throws on a non-2xx so the
// caller (or SWR's `error`) sees the failure instead of parsing an error body.
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}
