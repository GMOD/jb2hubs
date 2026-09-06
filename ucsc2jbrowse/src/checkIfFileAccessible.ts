import fs from 'fs'

import type { FileAccessCache } from './types.ts'

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000 // 90 days in milliseconds

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

const CACHE_DIR = 'fileAccessCache'

/**
 * Gets the cache filename for a specific assembly. Reading one must not create
 * the directory: the read path runs wherever a caller happens to be, and a
 * `mkdir` here is how a unit test left a stray `fileAccessCache/` at the repo
 * root. The write path creates it.
 */
function getCacheFilename(assembly: string): string {
  return `${CACHE_DIR}/${assembly}.json`
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
    fs.mkdirSync(CACHE_DIR, { recursive: true })
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
 * A blocked result sticks for 90 days; an accessible one suppresses the re-probe
 * for the same window. Both are recorded, which is what lets a file that comes
 * back get picked up on the next sweep.
 *
 * The whole thing is a no-op unless CHECK_404 is set (make.sh sets it), so the
 * unit tests exercise their callers' logic without the network.
 */
export async function checkIfFileAccessible({
  url,
  assembly,
  trackName,
}: {
  url: string
  assembly: string
  trackName?: string
}) {
  if (process.env.CHECK_404) {
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
      if (timeSinceLastCheck < THREE_MONTHS_MS) {
        // Don't re-check files that were checked within the last 3 months
        return !cachedEntry.blocked
      }
    }

    try {
      const response = await fetch(key, { method: 'HEAD' })

      if (response.ok) {
        saveCheckResult(assembly, key, false, trackName)
        return true
      }

      // Only upstream saying the file is not there counts as blocked. A 5xx or
      // a rate limit is upstream having a bad day, and recording it would drop
      // the track and then decline to re-check for 90 days — so a single
      // hgdownload outage during a pipeline run would quietly strip tracks off
      // every assembly it touched and keep them off for a quarter. The same
      // 404-vs-transient distinction mirrorSidecars.ts draws, for the same
      // reason.
      if (response.status === 404 || response.status === 410) {
        console.error(`File not published (${response.status}): ${url}`)
        saveCheckResult(assembly, key, true, trackName)
        return false
      }

      console.error(
        `Inconclusive (${response.status}), keeping the track and not caching: ${url}`,
      )
      return true
    } catch (error) {
      // A timeout or a refused connection says nothing about the file.
      console.error(
        `Could not reach upstream, keeping the track and not caching: ${url} (${error})`,
      )
      return true
    }
  }
  return true
}
