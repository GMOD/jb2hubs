import * as fs from 'fs'
import * as path from 'path'

import {
  checked,
  hubCategories,
  isArray,
  isErrnoCode,
  parseAssemblyEntry,
  readGenArkHubList,
  readJSON,
  writeIfChanged,
} from 'hubtools'

import { assertMostlyPublished, assertNoSharpShrink } from './publishedHubs.ts'
import { getHubBasePath } from './util.ts'

import type { ProcessedHubEntry } from 'hubtools'

// Get main category IDs for determining primary source
const mainCategories = new Set(
  hubCategories.filter(c => c.tag === 'main').map(c => c.id),
)

function previousCount() {
  try {
    return checked(
      readJSON('processedHubJson/all.json'),
      isArray,
      'processedHubJson/all.json',
    ).length
  } catch (e) {
    if (isErrnoCode(e, 'ENOENT')) {
      return undefined
    }
    throw e
  }
}

/**
 * Processes raw hub JSON files, parses each assembly entry, and writes
 * processed JSON files for individual categories and a combined 'all.json'.
 */
function processHubJsonFiles() {
  // Map to deduplicate by accession, preferring main category sources
  const accessionMap = new Map<string, ProcessedHubEntry>()
  const listed = new Set<string>()
  const unpublished = new Set<string>()
  const categoryFiles: [string, ProcessedHubEntry[]][] = []

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

    const isMainCategory = mainCategories.has(sourceCategory)

    // Read the raw hub JSON data for the current category
    const processedCategoryEntries = readGenArkHubList(file)
      .map(entry => parseAssemblyEntry({ entry }))
      .filter(
        (e): e is NonNullable<ReturnType<typeof parseAssemblyEntry>> =>
          e != null,
      )
      .filter(e => {
        listed.add(e.accession)
        if (fs.existsSync(`${getHubBasePath(e.accession)}/hub.txt`)) {
          return true
        }
        unpublished.add(e.accession)
        return false
      })
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

    categoryFiles.push([
      `processedHubJson/${sourceCategory}.json`,
      processedCategoryEntries,
    ])
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
  }

  assertMostlyPublished(unpublished.size, listed.size)
  assertNoSharpShrink(previousCount(), accessionMap.size)
  if (unpublished.size) {
    console.log(
      `Dropped ${unpublished.size} listed hub(s) with no hub.txt: ${[...unpublished].join(' ')}`,
    )
  }
  // Category lists can quote a taxon NCBI has since split or merged (VGP's
  // bowfin as 7924 where fish says 2972642), and taxon pages exist only for
  // all.json's taxa, so every category takes all.json's taxon for an accession.
  let retaxoned = 0
  for (const [file, entries] of categoryFiles) {
    const unified = entries.map(e => {
      const chosen = accessionMap.get(e.accession)
      if (chosen && chosen.taxonId !== e.taxonId) {
        retaxoned++
        console.log(
          `${file}: ${e.accession} taxon ${e.taxonId} (${e.scientificName}) -> ${chosen.taxonId} (${chosen.scientificName}) from ${chosen.source}`,
        )
      }
      return chosen
        ? {
            ...e,
            taxonId: chosen.taxonId,
            scientificName: chosen.scientificName,
          }
        : e
    })
    writeIfChanged(file, JSON.stringify(unified, null, 2))
  }
  console.log(`Took all.json's taxon for ${retaxoned} category row(s)`)

  // Write the combined 'all.json' file
  const allProcessedEntries = [...accessionMap.values()]
  const allChanged = writeIfChanged(
    'processedHubJson/all.json',
    JSON.stringify(allProcessedEntries, null, 2),
  )
  console.log(
    `${allChanged ? 'Generated' : 'Kept'} processedHubJson/all.json with ${allProcessedEntries.length} unique entries`,
  )
}

processHubJsonFiles()
