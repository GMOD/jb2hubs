// How long a request to a third-party service may take before it fails with a
// TimeoutError instead of hanging the page. The site's own assets get no
// deadline: they do not stall, and the 8 MB search index can take longer on a
// slow link.
export const FETCH_TIMEOUT_MS = 30_000

export function withDeadline(signal?: AbortSignal | null) {
  const deadline = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, deadline]) : deadline
}

export function isTimeout(e: unknown): e is Error {
  return e instanceof Error && e.name === 'TimeoutError'
}

export class HttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export function isGone(e: unknown) {
  return e instanceof HttpError && (e.status === 404 || e.status === 410)
}

function isSiteAsset(url: string) {
  return url.startsWith('/') && !url.startsWith('//')
}

async function okResponse(
  url: string,
  init: RequestInit,
  failure: (res: Response) => string,
) {
  const res = await fetch(url, {
    ...init,
    signal: isSiteAsset(url) ? init.signal : withDeadline(init.signal),
  })
  if (!res.ok) {
    throw new HttpError(failure(res), res.status)
  }
  return res
}

const statusLine = (res: Response) => `${res.status} ${res.statusText}`

// Throws on a non-2xx, so a caller or SWR's `error` sees the failure instead of
// parsing an error body.
export async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await okResponse(url, { signal }, statusLine)
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

// A JSON read from a third-party service, whose failure names the service and
// what was asked for.
export async function fetchServiceJson<T>(
  url: string,
  service: string,
  subject: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await okResponse(
    url,
    { headers: { Accept: 'application/json' }, signal },
    r => `${service} ${r.status} for ${subject}`,
  )
  return res.json() as Promise<T>
}

// fetchServiceJson for a read whose 404 or 410 is an answer (no entries, no
// profile).
export async function fetchJsonOr404<T>(
  url: string,
  service: string,
  subject: string,
  signal?: AbortSignal,
): Promise<T | undefined> {
  try {
    return await fetchServiceJson<T>(url, service, subject, signal)
  } catch (e) {
    if (isGone(e)) {
      return undefined
    }
    throw e
  }
}

// The text twin of fetchJson, for Stockholm and Newick reads.
export async function fetchText(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await okResponse(url, { signal }, statusLine)
  return res.text()
}
