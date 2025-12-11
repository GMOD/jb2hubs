/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

import { parseAssemblyEntry, hubCategories } from 'hubtools'

import { readJSON } from './util.ts'

import type { UCSCGenArkAssemblyEntry } from 'hubtools'

// Get main category IDs for determining primary source
const mainCategories = new Set(
  hubCategories.filter(c => c.tag === 'main').map(c => c.id),
)

/**
 * Processes raw hub JSON files, parses each assembly entry, and writes
 * processed JSON files for individual categories and a combined 'all.json'.
 */
async function processHubJsonFiles() {
  // Map to deduplicate by accession, preferring main category sources
  const accessionMap = new Map<string, UCSCGenArkAssemblyEntry>()

  // Read all files in the 'hubJson' directory
  const hubJsonFiles = fs
    .readdirSync('hubJson')
    .filter(f => f.endsWith('.json'))
    .map(f => path.join('hubJson', f))

  // Sort files to process main categories first
  hubJsonFiles.sort((a, b) => {
    const catA = path.basename(a, '.json')
    const catB = path.basename(b, '.json')
    const aIsMain = mainCategories.has(catA)
    const bIsMain = mainCategories.has(catB)
    if (aIsMain && !bIsMain) {
      return -1
    }
    if (!aIsMain && bIsMain) {
      return 1
    }
    return 0
  })

  // Ensure the output directory exists
  fs.mkdirSync('processedHubJson', { recursive: true })

  for (const file of hubJsonFiles) {
    const sourceCategory = path.basename(file, '.json')

    // Skip 'all.json' if it exists, as it's an output file
    if (sourceCategory === 'all') {
      continue
    }

    const isMainCategory = mainCategories.has(sourceCategory)

    try {
      // Read the raw hub JSON data for the current category
      const rawHubData = await readJSON<{ data: UCSCGenArkAssemblyEntry[] }>(
        file,
      )

      // Process each entry and add the source category
      const processedCategoryEntries = rawHubData.data.map(entry => ({
        ...parseAssemblyEntry({ entry }),
        source: sourceCategory,
      }))

      // Write the processed JSON for the current category
      fs.writeFileSync(
        `processedHubJson/${sourceCategory}.json`,
        JSON.stringify(processedCategoryEntries, null, 2),
      )
      console.log(`Processed ${sourceCategory}.json`)

      // Add to accession map, preferring main category sources
      for (const entry of processedCategoryEntries) {
        const existing = accessionMap.get(entry.accession)
        if (!existing) {
          // New entry - use "uncategorized" for non-main categories
          accessionMap.set(entry.accession, {
            ...entry,
            source: isMainCategory ? sourceCategory : 'uncategorized',
          } as UCSCGenArkAssemblyEntry)
        } else if (isMainCategory && !mainCategories.has(existing.source)) {
          // Replace non-main source with main source
          accessionMap.set(entry.accession, entry as UCSCGenArkAssemblyEntry)
        }
        // Otherwise keep existing (it's already a main category or we already have it)
      }
    } catch (error) {
      console.error(error)
    }
  }

  // Write the combined 'all.json' file
  const allProcessedEntries = [...accessionMap.values()]
  fs.writeFileSync(
    'processedHubJson/all.json',
    JSON.stringify(allProcessedEntries, null, 2),
  )
  console.log(`Generated processedHubJson/all.json with ${allProcessedEntries.length} unique entries`)
}

processHubJsonFiles().catch(console.error)
