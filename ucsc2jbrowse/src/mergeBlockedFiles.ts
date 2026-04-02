/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

import type { BlockedFileCache } from './types.ts'

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
      const cache: BlockedFileCache = JSON.parse(
        fs.readFileSync(filePath, 'utf-8'),
      )
      for (const [url, entry] of Object.entries(cache)) {
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

  console.log(`Merged cache contains:`)
  console.log(`  - ${totalEntries} total URLs`)
  console.log(`  - ${blockedCount} blocked`)
  console.log(`  - ${totalEntries - blockedCount} accessible`)

  fs.writeFileSync(outputFile, JSON.stringify(mergedCache, null, 2))
  console.log(`Merged cache written to ${outputFile}`)
}

mergeBlockedFiles()
