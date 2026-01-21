import fs from 'fs'

type BlockedFileCache = Record<
  string,
  {
    lastChecked: number
    blocked: boolean
    trackName?: string
  }
>

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000 // 90 days in milliseconds

// Cache per assembly to avoid contention between parallel processes
const cacheByAssembly = new Map<string, BlockedFileCache>()

/**
 * Extracts the assembly name from a URL.
 */
function getAssemblyFromUrl(url: string): string | null {
  // Match assembly names like hg19, hg38, mm39, mm10, etc.
  const match = /\/(hg\d+|mm\d+|dm\d+|ce\d+|sacCer\d+|danRer\d+|hs\d+)\//.exec(
    url,
  )
  return match ? match[1]! : null
}

/**
 * Gets the cache filename for a specific assembly.
 */
function getCacheFilename(assembly: string): string {
  // Ensure blockedFiles directory exists
  const dir = 'blockedFiles'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return `${dir}/${assembly}.json`
}

/**
 * Loads the blocked files cache for a specific assembly from disk.
 */
function loadBlockedFilesCache(assembly: string): BlockedFileCache {
  if (cacheByAssembly.has(assembly)) {
    return cacheByAssembly.get(assembly)!
  }

  const cacheFile = getCacheFilename(assembly)
  let cache: BlockedFileCache = {}

  try {
    if (fs.existsSync(cacheFile)) {
      const data = fs.readFileSync(cacheFile, 'utf-8')
      cache = JSON.parse(data)
    }
  } catch (error) {
    console.error(`Error loading blocked files cache for ${assembly}: ${error}`)
  }

  cacheByAssembly.set(assembly, cache)
  return cache
}

/**
 * Saves a blocked file to the cache with a timestamp.
 */
function saveBlockedFile(
  assembly: string,
  url: string,
  blocked: boolean,
  trackName?: string,
) {
  const cache = loadBlockedFilesCache(assembly)
  cache[url] = {
    lastChecked: Date.now(),
    blocked,
    ...(trackName && { trackName }),
  }

  try {
    const cacheFile = getCacheFilename(assembly)
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
  } catch (error) {
    console.error(`Error saving blocked files cache for ${assembly}: ${error}`)
  }
}

/**
 * Checks if a given URL is accessible by making a HEAD request.
 * If the URL is not accessible and contains 'hg19', 'hg38', 'mm39', or 'mm10', it logs the URL to cache.
 * URLs that were blocked within the last 3 months will not be re-checked.
 * @param url The URL to check.
 * @param trackName Optional track name to store with the file entry.
 * @returns A promise that resolves to true if the file is accessible, false otherwise.
 */
export async function checkIfFileAccessible({
  url,
  trackName,
}: {
  url: string
  trackName?: string
}) {
  // Only perform HEAD request for UCSC-related URLs
  if (process.env.CHECK_404) {
    // Extract assembly from URL to use assembly-specific cache
    const assembly = getAssemblyFromUrl(url)
    if (!assembly) {
      // Can't determine assembly, skip caching
      return true
    }

    // Check if we have a cached result for this assembly
    const cache = loadBlockedFilesCache(assembly)
    const cachedEntry = cache[url]

    if (cachedEntry) {
      const timeSinceLastCheck = Date.now() - cachedEntry.lastChecked
      if (timeSinceLastCheck < THREE_MONTHS_MS) {
        // Don't re-check files that were checked within the last 3 months
        return !cachedEntry.blocked
      }
    }

    try {
      const response = await fetch(
        url.startsWith('https') ? url : `https://hgdownload.soe.ucsc.edu${url}`,
        {
          method: 'HEAD',
        },
      )

      if (!response.ok) {
        console.error(
          `File not accessible (status: ${response.status}): ${url}`,
        )
        saveBlockedFile(assembly, url, true, trackName)
        return false
      }
      // File is accessible, update cache to mark as not blocked
      saveBlockedFile(assembly, url, false, trackName)
      return true
    } catch (error) {
      console.error(`Error checking file accessibility for ${url}: ${error}`)
      saveBlockedFile(assembly, url, true, trackName)
      return false
    }
  }
  // For non-UCSC URLs, assume accessibility or handle elsewhere
  return true
}
