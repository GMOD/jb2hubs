/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

type BlockedFileCache = Record<
  string,
  {
    lastChecked: number
    blocked: boolean
    trackName?: string
  }
>

/**
 * Merges all assembly-specific blocked files JSON into a single blockedFiles.json
 */
function mergeBlockedFiles() {
  const blockedFilesDir = 'blockedFiles'
  const outputFile = 'blockedFiles.json'

  if (!fs.existsSync(blockedFilesDir)) {
    console.log('No blockedFiles directory found, nothing to merge')
    return
  }

  const mergedCache: BlockedFileCache = {}
  const files = fs.readdirSync(blockedFilesDir).filter(f => f.endsWith('.json'))

  if (files.length === 0) {
    console.log('No blocked files found to merge')
    return
  }

  console.log(`Merging ${files.length} blocked files caches...`)

  for (const file of files) {
    const filePath = path.join(blockedFilesDir, file)
    try {
      const data = fs.readFileSync(filePath, 'utf-8')
      const cache: BlockedFileCache = JSON.parse(data)

      // Merge into the combined cache
      for (const [url, entry] of Object.entries(cache)) {
        // If URL exists, keep the most recent check
        if (
          !mergedCache[url] ||
          entry.lastChecked > mergedCache[url].lastChecked
        ) {
          mergedCache[url] = entry
        }
      }
    } catch (error) {
      console.error(`Error reading ${filePath}: ${error}`)
    }
  }

  const totalEntries = Object.keys(mergedCache).length
  const blockedCount = Object.values(mergedCache).filter(e => e.blocked).length
  const accessibleCount = totalEntries - blockedCount

  console.log(`Merged cache contains:`)
  console.log(`  - ${totalEntries} total URLs`)
  console.log(`  - ${blockedCount} blocked`)
  console.log(`  - ${accessibleCount} accessible`)

  fs.writeFileSync(outputFile, JSON.stringify(mergedCache, null, 2))
  console.log(`Merged cache written to ${outputFile}`)
}

mergeBlockedFiles()
