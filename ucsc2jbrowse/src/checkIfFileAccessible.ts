import fs from 'fs'

import type { FileAccessCache } from './types.ts'

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000 // 90 days in milliseconds

// Cache per assembly to avoid contention between parallel processes
const cacheByAssembly = new Map<string, FileAccessCache>()

/**
 * Gets the cache filename for a specific assembly.
 */
function getCacheFilename(assembly: string): string {
  // Ensure fileAccessCache directory exists
  const dir = 'fileAccessCache'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return `${dir}/${assembly}.json`
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

/**
 * Saves a blocked file to the cache with a timestamp.
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

  try {
    const cacheFile = getCacheFilename(assembly)
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
  } catch (error) {
    console.error(`Error saving file access cache for ${assembly}: ${error}`)
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
