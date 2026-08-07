import fs from 'fs'
import path from 'path'

import type { FileAccessCache } from './types.ts'

// The per-assembly caches under fileAccessCache/ record every URL we have
// HEAD'd, accessible ones included, because that is what lets a later run skip
// re-probing a file that is fine (hgdownload throttles bulk probes hard). The
// merged report is the opposite: it exists to answer "what is missing", is
// rendered by website/src/pages/unavailableTracks.astro, and is the file a
// human reads in a diff. So it carries only blocked:true — 39 entries rather
// than 2417, and a nonempty diff means a track actually broke.
function mergeFileAccessCache() {
  const cacheDir = 'fileAccessCache'
  const outputFile = 'blockedFiles.json'

  if (!fs.existsSync(cacheDir)) {
    console.log('No fileAccessCache directory found, nothing to merge')
    return
  }

  const merged: FileAccessCache = {}
  const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'))

  if (files.length === 0) {
    console.log('No file access caches found to merge')
    return
  }

  console.log(`Merging ${files.length} file access caches...`)

  for (const file of files) {
    const filePath = path.join(cacheDir, file)
    try {
      const cache: FileAccessCache = JSON.parse(
        fs.readFileSync(filePath, 'utf-8'),
      )
      for (const [url, entry] of Object.entries(cache)) {
        if (!merged[url] || entry.lastChecked > merged[url].lastChecked) {
          merged[url] = entry
        }
      }
    } catch (error) {
      console.error(`Error reading ${filePath}: ${error}`)
    }
  }

  const blocked: FileAccessCache = {}
  for (const [url, entry] of Object.entries(merged)) {
    if (entry.blocked) {
      blocked[url] = entry
    }
  }

  const totalEntries = Object.keys(merged).length
  const blockedCount = Object.keys(blocked).length

  console.log(`Checked URLs across all assemblies:`)
  console.log(`  - ${totalEntries} total`)
  console.log(`  - ${blockedCount} blocked`)
  console.log(`  - ${totalEntries - blockedCount} accessible`)

  // Trailing newline so oxfmt does not rewrite the file it just generated
  fs.writeFileSync(outputFile, `${JSON.stringify(blocked, null, 2)}\n`)
  console.log(`Blocked-file report written to ${outputFile}`)
}

mergeFileAccessCache()
