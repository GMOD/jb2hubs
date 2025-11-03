import fs from 'fs'

interface BlockedFileCache {
  [url: string]: {
    lastChecked: number
    blocked: boolean
  }
}

const BLOCKED_FILES_CACHE = 'blockedFiles.json'
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000 // 90 days in milliseconds

let cachedBlockedFiles: BlockedFileCache | null = null

/**
 * Loads the blocked files cache from disk.
 */
function loadBlockedFilesCache(): BlockedFileCache {
  if (cachedBlockedFiles) {
    return cachedBlockedFiles
  }

  try {
    if (fs.existsSync(BLOCKED_FILES_CACHE)) {
      const data = fs.readFileSync(BLOCKED_FILES_CACHE, 'utf-8')
      cachedBlockedFiles = JSON.parse(data)
      return cachedBlockedFiles!
    }
  } catch (error) {
    console.error(`Error loading blocked files cache: ${error}`)
  }

  cachedBlockedFiles = {}
  return cachedBlockedFiles
}

/**
 * Saves a blocked file to the cache with a timestamp.
 */
function saveBlockedFile(url: string, blocked: boolean) {
  const cache = loadBlockedFilesCache()
  cache[url] = {
    lastChecked: Date.now(),
    blocked,
  }

  try {
    fs.writeFileSync(BLOCKED_FILES_CACHE, JSON.stringify(cache, null, 2))
  } catch (error) {
    console.error(`Error saving blocked files cache: ${error}`)
  }
}

/**
 * Checks if a given URL is accessible by making a HEAD request.
 * If the URL is not accessible and contains 'hg19', 'hg38', 'mm39', or 'mm10', it logs the URL to cache.
 * URLs that were blocked within the last 3 months will not be re-checked.
 * @param url The URL to check.
 * @returns A promise that resolves to true if the file is accessible, false otherwise.
 */
export async function checkIfFileAccessible({ url }: { url: string }) {
  // Only perform HEAD request for UCSC-related URLs
  if (process.env.CHECK_404) {
    // Check if we have a cached result
    const cache = loadBlockedFilesCache()
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
        saveBlockedFile(url, true)
        return false
      }
      // File is accessible, update cache to mark as not blocked
      saveBlockedFile(url, false)
      return true
    } catch (error) {
      console.error(`Error checking file accessibility for ${url}: ${error}`)
      saveBlockedFile(url, true)
      return false
    }
  }
  // For non-UCSC URLs, assume accessibility or handle elsewhere
  return true
}
