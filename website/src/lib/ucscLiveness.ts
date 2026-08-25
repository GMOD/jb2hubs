// Is UCSC's download server answering right now?
//
// This exists for one user-facing failure that had no signal at all. When
// hgdownload stops serving, it does not return errors — it completes the TCP
// handshake in ~120ms, accepts the TLS Client Hello, and never replies.
// Measured 2026-08-25, with hgdownload2 and genome.ucsc.edu healthy throughout.
//
// jbrowse-core sets no timeout on those fetches, so nothing ever rejects and
// nothing is ever reported. A track sits on a loading spinner indefinitely, and
// `assembly.loadPre()` — which resolves the sequence regions, refNameAliases and
// cytobands in one Promise.all — simply never settles. The reader sees a browser
// that is "still loading" forever, with no way to learn that a server three
// hundred miles away is the reason.
//
// We cannot fix that inside the session from here: the hang lives in the hosted
// jbrowse-web build and in @cmdcolin/jbrowse-plugin-hubs, both published from
// other repos, and a fix in either would not reach the pinned older hosts our
// permanent config urls still serve. What this repo CAN do is say so on the page
// the reader launches from, before they click.
//
// A TIMEOUT ALONE PROVES NOTHING, SO THIS MEASURES A DIFFERENCE
//
// A dropped wifi link produces exactly the same timeout as a stalled hgdownload,
// and so does a tracking blocker that pattern-matched an unfamiliar host, or a
// corporate proxy. `navigator.onLine` does not help — it reports the interface,
// not whether packets arrive. Announcing "UCSC is down" on that evidence would
// put a false alarm about someone's own laptop on every page.
//
// So both hosts are probed together: hgdownload, and a control on our own
// origin. Only the combination is evidence.
//
//   UCSC times out   +  control fast     -> UCSC. This is what we warn about.
//   UCSC times out   +  control also bad -> the reader's network. Say nothing.
//   UCSC answers slowly + control fast   -> UCSC is degraded but working.
//   anything else                        -> we learned nothing. Say nothing.
//
// The control costs nothing: it is a HEAD against our own CDN, which is already
// serving the page doing the asking.
export type UcscLiveness = 'ok' | 'slow' | 'stalled' | 'unknown'

// hg38's chrom.sizes: small, and about as permanent as anything UCSC serves. A
// HEAD transfers no body at all, so the probe costs a request and no bytes.
//
// HEAD is CORS-safelisted and we send no custom headers, so there is no
// preflight — one request, not two. hgdownload answers with
// `Access-Control-Allow-Origin: *`, verified 2026-08-25.
export const PROBE_URL =
  'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.chrom.sizes'

// Same-origin, so it is served by the CDN that just served this page. Chosen
// because it is tiny and cannot 404 while the site is up.
export const CONTROL_URL = '/favicon.ico'

// The probes MUST have a hard deadline. The failure they detect is an open
// connection that never answers, so a probe without one would hang exactly like
// the thing it is diagnosing, and the banner would never appear during the
// outage it exists for.
export const PROBE_TIMEOUT_MS = 6000

// A control this slow means the reader's own path is bad, so nothing can be
// concluded about UCSC. Deliberately generous: our CDN answers in ~200ms, and
// the point is to catch a genuinely broken connection, not a slow one.
export const CONTROL_BUDGET_MS = 3000

// Answered, but slowly enough that a session will feel broken. Calibrated
// against the recovery on 2026-08-25: the first success after the stall took
// 6.9s to complete its TLS handshake alone, where a healthy hgdownload is ~1.0s.
// A track needing hundreds of range requests at that latency will not finish.
export const SLOW_THRESHOLD_MS = 2500

// Re-probed on this interval while a page is open, and shared across tabs and
// page views through localStorage. The cost to UCSC therefore scales with
// distinct readers per window rather than with page views — and one bodiless
// HEAD is a rounding error beside the hundreds of range requests the session
// that reader is about to launch will make against the same host.
export const CACHE_TTL_MS = 120_000

const CACHE_KEY = 'ucscLiveness.v1'

export interface LivenessResult {
  verdict: UcscLiveness
  elapsedMs: number
  at: number
}

interface ProbeOutcome {
  timedOut: boolean
  ok: boolean
  elapsedMs: number
}

export function classify({
  ucsc,
  control,
}: {
  ucsc: ProbeOutcome
  control: ProbeOutcome
}): UcscLiveness {
  // No usable baseline: the reader's path is bad, or our own CDN is, and neither
  // licenses a claim about UCSC.
  if (!control.ok || control.elapsedMs >= CONTROL_BUDGET_MS) {
    return 'unknown'
  }
  if (ucsc.timedOut) {
    return 'stalled'
  }
  if (!ucsc.ok) {
    // A 5xx or a 403 is upstream having a bad day, but it is answering, and it
    // is not the hang this warns about. Better to say nothing than to describe
    // the wrong failure.
    return 'unknown'
  }
  return ucsc.elapsedMs >= SLOW_THRESHOLD_MS ? 'slow' : 'ok'
}

export function isDegraded(verdict: UcscLiveness) {
  return verdict === 'stalled' || verdict === 'slow'
}

// lib.dom types localStorage as always present, but it is absent under the node
// test runner and merely *reading* the property throws in Safari private mode, an
// embedded webview, or a browser set to block site data. Going through a function
// with a widened return type says what is true at runtime and keeps it from being
// narrowed straight back away — the same dodge features.ts uses for
// `import.meta.env`.
function storage(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage
}

// Every access is guarded, so a failure degrades to "no cache" rather than
// taking the page down.
export function readCachedLiveness(now: number): LivenessResult | undefined {
  try {
    const raw = storage()?.getItem(CACHE_KEY)
    if (!raw) {
      return undefined
    }
    const parsed = JSON.parse(raw) as LivenessResult
    if (typeof parsed.at !== 'number' || now - parsed.at >= CACHE_TTL_MS) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

export function writeCachedLiveness(result: LivenessResult) {
  try {
    storage()?.setItem(CACHE_KEY, JSON.stringify(result))
  } catch {
    /* a reader who blocks site data just re-probes; nothing else depends on it */
  }
}

export interface ProbeDeps {
  fetchImpl?: typeof globalThis.fetch
  now?: () => number
}

async function timedHead(
  url: string,
  { fetchImpl = globalThis.fetch, now = Date.now }: ProbeDeps,
): Promise<ProbeOutcome> {
  const started = now()
  try {
    const res = await fetchImpl(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return { timedOut: false, ok: res.ok, elapsedMs: now() - started }
  } catch (e) {
    // AbortSignal.timeout aborts with a TimeoutError. Anything else — a blocked
    // request, DNS, a proxy — is not evidence of a stall.
    return {
      timedOut: (e as Error | undefined)?.name === 'TimeoutError',
      ok: false,
      elapsedMs: now() - started,
    }
  }
}

/**
 * Probe hgdownload against a same-origin control and classify the difference,
 * reusing a cached verdict inside CACHE_TTL_MS.
 *
 * Both requests go out together, so the whole thing costs one round trip of
 * wall time rather than two, and the control's timing is measured under the same
 * network conditions as the subject's.
 */
export async function probeUcscLiveness(
  deps: ProbeDeps = {},
): Promise<LivenessResult> {
  const now = deps.now ?? Date.now
  const started = now()
  const cached = readCachedLiveness(started)
  if (cached) {
    return cached
  }

  const [ucsc, control] = await Promise.all([
    timedHead(PROBE_URL, deps),
    timedHead(CONTROL_URL, deps),
  ])

  const result = {
    verdict: classify({ ucsc, control }),
    elapsedMs: ucsc.elapsedMs,
    at: started,
  }
  // `unknown` means we learned nothing; caching it would suppress the next real
  // probe for two minutes.
  if (result.verdict !== 'unknown') {
    writeCachedLiveness(result)
  }
  return result
}
