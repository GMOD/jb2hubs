import fs from 'fs'
import path from 'path'

import { FETCH_TIMEOUT_MS } from 'hubtools'

import { UCSC_ROOT } from './util.ts'

import type { FileAccessCache } from './types.ts'

const MIN_TTL_MS = 90 * 24 * 60 * 60 * 1000

// Each url's TTL is 90 to 135 days, fixed by a hash of the url. Entries probed
// in one run would otherwise all expire in one run: 47,208 entries share a
// lastChecked, and hg38's 21,779 alone are 35-100 minutes of HEADs.
function ttlMs(url: string) {
  let hash = 2166136261
  for (let i = 0; i < url.length; i++) {
    hash = Math.imul(hash ^ url.charCodeAt(i), 16777619) >>> 0
  }
  return MIN_TTL_MS * (1 + (hash % 1000) / 2000)
}

// Cache per assembly to avoid contention between parallel processes
const cacheByAssembly = new Map<string, FileAccessCache>()

// The assemblies whose in-memory cache has moved since it was last written.
//
// Every probe used to rewrite the whole file. hg38's is 21,779 entries and 6MB,
// so a pass that has to re-probe it spends ~130GB of writes restating what it
// already knew; even an ordinary run pays a 6MB serialize per newly-seen url.
// The map is the authority for the run, so it is written once at the end
// instead. What that trades is a run killed by a signal, which now loses the
// probes it spent -- they are re-derivable at the cost of the requests, and the
// budget that matters (checkTrackUrls.mjs) is a different, throttled path.
const dirtyAssemblies = new Set<string>()
let flushRegistered = false

let cacheDir = path.join(UCSC_ROOT, 'fileAccessCache')

// The tests point the caches at a temp dir.
export function setFileAccessCacheDir(dir: string) {
  cacheDir = dir
  cacheByAssembly.clear()
  dirtyAssemblies.clear()
}

// A scratch build (buildConfigs.ts --out-root) answers from the caches as they
// are, whatever their age: no HEAD, no entry recorded, no file written. A url
// the caches do not know keeps its track.
let readOnly = false

export function setFileAccessCachesReadOnly(value: boolean) {
  readOnly = value
}

// Whether url checks run at all: make.sh sets CHECK_404, and a scratch build
// answers from the caches. Off, the unit tests exercise callers without the
// network.
export function urlChecksEnabled() {
  return !!process.env.CHECK_404 || readOnly
}

/**
 * Gets the cache filename for a specific assembly. Reading one must not create
 * the directory: the read path runs wherever a caller happens to be, and a
 * `mkdir` here is how a unit test left a stray `fileAccessCache/` at the repo
 * root. The write path creates it.
 */
function getCacheFilename(assembly: string): string {
  return path.join(cacheDir, `${assembly}.json`)
}

/**
 * Loads the file access cache for a specific assembly from disk.
 */
function loadFileAccessCache(assembly: string): FileAccessCache {
  if (cacheByAssembly.has(assembly)) {
    return cacheByAssembly.get(assembly)!
  }

  const cacheFile = getCacheFilename(assembly)
  let cache: FileAccessCache = {}

  try {
    if (fs.existsSync(cacheFile)) {
      const data = fs.readFileSync(cacheFile, 'utf-8')
      cache = JSON.parse(data)
    }
  } catch (error) {
    console.error(`Error loading file access cache for ${assembly}: ${error}`)
  }

  cacheByAssembly.set(assembly, cache)
  return cache
}

/** Writes every cache whose in-memory copy has moved, and forgets the marks. */
export function flushFileAccessCaches() {
  if (dirtyAssemblies.size > 0) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  for (const assembly of dirtyAssemblies) {
    try {
      fs.writeFileSync(
        getCacheFilename(assembly),
        JSON.stringify(cacheByAssembly.get(assembly), null, 2),
      )
    } catch (error) {
      console.error(`Error saving file access cache for ${assembly}: ${error}`)
    }
  }
  dirtyAssemblies.clear()
}

/**
 * Records a probe's answer in the cache, to be written out at exit.
 */
function saveCheckResult(
  assembly: string,
  url: string,
  blocked: boolean,
  trackName?: string,
) {
  const cache = loadFileAccessCache(assembly)
  cache[url] = {
    lastChecked: Date.now(),
    blocked,
    ...(trackName && { trackName }),
  }
  dirtyAssemblies.add(assembly)
  if (!flushRegistered) {
    flushRegistered = true
    // Covers both a clean finish and buildConfigs.ts's process.exit(1) on a
    // failed assembly, and needs no caller to remember it -- a step that
    // probes a url is not one that knows when the run is over.
    process.on('exit', flushFileAccessCaches)
  }
}

const PROBE_ATTEMPTS = 3
const PROBE_RETRY_DELAY_MS = 2000

// Whether upstream has answered the question, so asking again would only get
// the same answer. 408 and 429 are the two 4xx that explicitly mean "ask
// again"; everything else in that range is a decision, and a 5xx or a thrown
// connection error is not an answer at all. The same split hubtools' myfetch
// draws, for the same reason.
function answeredDefinitively(status: number) {
  return status < 500 && status !== 408 && status !== 429
}

type ProbeResult = { response: Response } | { unreachable: unknown }

/**
 * HEADs a url until upstream answers, or until the attempts run out.
 *
 * One attempt was enough to ship a 404. On 2026-09-13 hg38's alphaGenome
 * composite lost a single `TypeError: fetch failed` on `a.bw` while `c.bw`,
 * `g.bw` and `t.bw` beside it answered 404 in the same second, so the one file
 * of the four that upstream does not publish is the one that kept its track --
 * and, nothing having been cached, it stayed in the config until a later run
 * happened to probe it again. "Keep the track, cache nothing" is the right
 * answer to a stalled hgdownload and the wrong one to a blip; telling them
 * apart costs two more requests, and only on the failing path.
 */
async function probe(key: string, retryDelayMs: number): Promise<ProbeResult> {
  let unreachable: unknown
  for (let i = 0; i < PROBE_ATTEMPTS; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * i))
    }
    try {
      // hgdownload's documented failure is a connection that completes and
      // then never answers, and node's fetch waits on that indefinitely, so a
      // probe that should have taken 200ms hangs the whole config build
      // instead. This is the busiest fetch in either pipeline: one per
      // big-file track on a cold cache.
      const response = await fetch(key, {
        method: 'HEAD',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (response.ok || answeredDefinitively(response.status)) {
        return { response }
      }
      unreachable = `HTTP ${response.status}`
    } catch (error) {
      unreachable = error
    }
  }
  return { unreachable }
}

/**
 * HEADs a URL and remembers the answer, so a file upstream does not publish
 * becomes a track we drop rather than a track that 404s in production.
 *
 * The caller passes the assembly rather than this deriving it from the url. It
 * used to guess, with a regex over seven assembly families
 * (hg\d+|mm\d+|dm\d+|ce\d+|sacCer\d+|danRer\d+|hs\d+), and returned `true`
 * unchecked for anything that missed — which was most of the 238. rn3, galGal6,
 * bosTau9, wuhCor1 and the rest were never probed at all. Every caller already
 * knows the assembly it is building, so guessing bought nothing and silently
 * exempted the majority.
 *
 * A blocked result sticks for 90 to 135 days; an accessible one suppresses the
 * re-probe for the same window. Both are recorded, which is what lets a file that comes
 * back get picked up on the next sweep.
 *
 * A no-op unless urlChecksEnabled().
 */
export async function checkIfFileAccessible({
  url,
  assembly,
  trackName,
  retryDelayMs = PROBE_RETRY_DELAY_MS,
}: {
  url: string
  assembly: string
  trackName?: string
  // Only the tests pass this, to spend their transient cases in no time.
  retryDelayMs?: number
}) {
  if (urlChecksEnabled()) {
    // One key per file, whichever spelling the caller had. Callers pass a bare
    // /gbdb path in some places and a full url in others, and caching the two
    // separately meant the same file could be probed twice and recorded twice.
    const key = url.startsWith('http')
      ? url
      : `https://hgdownload.soe.ucsc.edu${url}`

    const cache = loadFileAccessCache(assembly)
    const cachedEntry = cache[key]

    if (cachedEntry) {
      const timeSinceLastCheck = Date.now() - cachedEntry.lastChecked
      if (readOnly || timeSinceLastCheck < ttlMs(key)) {
        return !cachedEntry.blocked
      }
    }
    if (readOnly) {
      return true
    }

    const result = await probe(key, retryDelayMs)
    if ('response' in result) {
      const { response } = result
      if (response.ok) {
        saveCheckResult(assembly, key, false, trackName)
        return true
      } else if (response.status === 404 || response.status === 410) {
        // Only upstream saying the file is not there counts as blocked. A 5xx
        // or a rate limit is upstream having a bad day, and recording it would
        // drop the track and then decline to re-check for 90 days or more — so a single
        // hgdownload outage during a pipeline run would quietly strip tracks
        // off every assembly it touched and keep them off for a quarter. The
        // same 404-vs-transient distinction mirrorSidecars.ts draws, for the
        // same reason.
        console.error(`File not published (${response.status}): ${url}`)
        saveCheckResult(assembly, key, true, trackName)
        return false
      } else {
        console.error(
          `Inconclusive (${response.status}), keeping the track and not caching: ${url}`,
        )
      }
    } else {
      // A timeout or a refused connection says nothing about the file.
      console.error(
        `Could not reach upstream in ${PROBE_ATTEMPTS} attempts, keeping the track and not caching: ${url} (${result.unreachable})`,
      )
    }
  }
  return true
}
