/* eslint-disable no-console */
import * as fs from 'fs'
import * as path from 'path'

import { hubCategories, parseAssemblyEntry } from 'hubtools'

import { readJSON } from './util.ts'

import type { UCSCGenArkAssemblyEntry } from 'hubtools'

type ParsedEntry = Omit<
  NonNullable<ReturnType<typeof parseAssemblyEntry>>,
  | 'stats'
  | 'annotationInfo'
  | 'infraspecificNames'
  | 'comments'
  | 'gcPercent'
  | 'genomeCoverage'
  | 'sequencingTech'
  | 'bioprojectAccession'
  | 'pairedAssemblyStatus'
  | 'pairedAssemblyDifferences'
  | 'genomeNotes'
  | 'suppressionReason'
  | 'ncbiDownloadedAt'
> & { source: string }

// Get main category IDs for determining primary source
const mainCategories = new Set(
  hubCategories.filter(c => c.tag === 'main').map(c => c.id),
)

/**
 * Processes raw hub JSON files, parses each assembly entry, and writes
 * processed JSON files for individual categories and a combined 'all.json'.
 */
function processHubJsonFiles() {
  // Map to deduplicate by accession, preferring main category sources
  const accessionMap = new Map<string, ParsedEntry>()

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
      const rawHubData = readJSON<{ data: UCSCGenArkAssemblyEntry[] }>(file)

      // Process each entry and add the source category
      const processedCategoryEntries = rawHubData.data
        .map(entry => parseAssemblyEntry({ entry }))
        .filter(
          (e): e is NonNullable<ReturnType<typeof parseAssemblyEntry>> =>
            e != null,
        )
        .map(e => {
          // Strip detail-only fields that are only needed on individual accession
          // pages and can be read directly from ncbi.json at page-build time.
          const {
            stats: _stats,
            annotationInfo: _annotationInfo,
            infraspecificNames: _infraspecificNames,
            comments: _comments,
            gcPercent: _gcPercent,
            genomeCoverage: _genomeCoverage,
            sequencingTech: _sequencingTech,
            bioprojectAccession: _bioprojectAccession,
            pairedAssemblyStatus: _pairedAssemblyStatus,
            pairedAssemblyDifferences: _pairedAssemblyDifferences,
            genomeNotes: _genomeNotes,
            suppressionReason: _suppressionReason,
            ncbiDownloadedAt: _ncbiDownloadedAt,
            ...summary
          } = e
          return { ...summary, source: sourceCategory }
        })

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
          })
        } else if (isMainCategory && !mainCategories.has(existing.source)) {
          // Replace non-main source with main source
          accessionMap.set(entry.accession, entry)
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
  console.log(
    `Generated processedHubJson/all.json with ${allProcessedEntries.length} unique entries`,
  )
}

processHubJsonFiles()
