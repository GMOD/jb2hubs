/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

import { parseAssemblyEntry } from 'hubtools'

import { readJSON } from './util.ts'

import type { UCSCGenArkAssemblyEntry } from 'hubtools'
/**
 * Processes raw hub JSON files, parses each assembly entry, and writes
 * processed JSON files for individual categories and a combined 'all.json'.
 */
async function processHubJsonFiles() {
  let allProcessedEntries: UCSCGenArkAssemblyEntry[] = []

  // Read all files in the 'hubJson' directory
  const hubJsonFiles = fs
    .readdirSync('hubJson')
    .filter(f => f.endsWith('.json'))
    .map(f => path.join('hubJson', f))

  // Ensure the output directory exists
  fs.mkdirSync('processedHubJson', { recursive: true })

  for (const file of hubJsonFiles) {
    const sourceCategory = path.basename(file, '.json')

    // Skip 'all.json' if it exists, as it's an output file
    if (sourceCategory === 'all') {
      continue
    }

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

      // Accumulate all processed entries for the combined 'all.json'
      // @ts-expect-error
      allProcessedEntries = allProcessedEntries.concat(processedCategoryEntries)
    } catch (error) {
      console.error(error)
    }
  }

  // Write the combined 'all.json' file
  fs.writeFileSync(
    'processedHubJson/all.json',
    JSON.stringify(allProcessedEntries, null, 2),
  )
  console.log('Generated processedHubJson/all.json')
}

processHubJsonFiles().catch(console.error)
