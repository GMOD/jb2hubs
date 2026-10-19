import fs from 'fs'
import path from 'path'

import { FETCH_TIMEOUT_MS, isDefinitiveStatus, writeAtomic } from 'hubtools'

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

const cacheByAssembly = new Map<string, FileAccessCache>()

// Written once at exit: hg38's cache is 6MB, too big to rewrite per probe. A
// run killed by a signal loses the probes it spent.
const dirtyAssemblies = new Set<string>()
let flushRegistered = false

let cacheDir = path.join(UCSC_ROOT, 'fileAccessCache')

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

function getCacheFilename(assembly: string): string {
  return path.join(cacheDir, `${assembly}.json`)
}

// A cache that does not parse throws: treating it as empty would re-probe the
// whole assembly against hgdownload.
function loadFileAccessCache(assembly: string): FileAccessCache {
  let cache = cacheByAssembly.get(assembly)
  if (!cache) {
    const cacheFile = getCacheFilename(assembly)
    cache = fs.existsSync(cacheFile)
      ? (JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as FileAccessCache)
      : {}
    cacheByAssembly.set(assembly, cache)
  }
  return cache
}

export function flushFileAccessCaches() {
  if (dirtyAssemblies.size > 0) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  for (const assembly of dirtyAssemblies) {
    try {
      writeAtomic(
        getCacheFilename(assembly),
        JSON.stringify(cacheByAssembly.get(assembly), null, 2),
      )
    } catch (error) {
      console.error(`Error saving file access cache for ${assembly}: ${error}`)
    }
  }
  dirtyAssemblies.clear()
}

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
    process.on('exit', flushFileAccessCaches)
  }
}

const PROBE_ATTEMPTS = 3
const PROBE_RETRY_DELAY_MS = 2000

type ProbeResult = { response: Response } | { unreachable: unknown }

// HEADs a url until upstream answers or the attempts run out: one dropped
// request would otherwise keep a track whose file 404s.
async function probe(key: string, retryDelayMs: number): Promise<ProbeResult> {
  let unreachable: unknown
  for (let i = 0; i < PROBE_ATTEMPTS; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * i))
    }
    try {
      const response = await fetch(key, {
        method: 'HEAD',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (response.ok || isDefinitiveStatus(response.status)) {
        return { response }
      }
      unreachable = `HTTP ${response.status}`
    } catch (error) {
      unreachable = error
    }
  }
  return { unreachable }
}

// HEADs a url and remembers the answer for 90 to 135 days, so a file upstream
// does not publish becomes a dropped track rather than a 404. Only a 404 or 410
// counts as blocked; anything else keeps the track and caches nothing.
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
        console.error(`File not published (${response.status}): ${url}`)
        saveCheckResult(assembly, key, true, trackName)
        return false
      } else {
        console.error(
          `Inconclusive (${response.status}), keeping the track and not caching: ${url}`,
        )
      }
    } else {
      console.error(
        `Could not reach upstream in ${PROBE_ATTEMPTS} attempts, keeping the track and not caching: ${url} (${result.unreachable})`,
      )
    }
  }
  return true
}
