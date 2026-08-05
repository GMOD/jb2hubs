import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { readConfig, writeJSON } from './util.ts'

import type { JBrowseConfig } from './types'

/**
 * Track categories to include in minimal configs.
 * These are matched against the trackId (case-insensitive).
 */
const MINIMAL_TRACK_PATTERNS = [
  'ncbirefseq', // NCBI RefSeq tracks
  'gencode', // GENCODE tracks
  'rmsk', // RepeatMasker tracks
  'gap', // Gap tracks (gap, gapOverlap)
  'allgaps', // also a gap track, but not under the `gap` name
  'clinvar', // clinvarMain/Cnv/SubLolly, clinvarLift, clinVar<date> on hs1
]

/**
 * Whether a track belongs in the minimal config.
 *
 * A pattern has to match a whole trackId segment, not any substring of one.
 * These trackIds are `<db>-<ucscTrackName>`, so anchoring at the start or just
 * after a dash names the track group and nothing else.
 *
 * As a bare substring, `gencode` also matched every ENCODE regulation track,
 * because `hg38-wgEncodeReg4Dnase` lowercases to `hg38-wgencodereg4dnase` and
 * `wgencode` contains `gencode`. That put 11 of hg38's 33 minimal tracks -- and
 * 82% of its bytes -- into a file whose whole purpose is to be small: 241KB
 * against 43KB without them, on the artifact the hubs plugin now fetches to
 * resolve a genome on demand. `gap` collected `veGAPseudogene` and `cGAPSage`
 * the same way.
 */
export function shouldIncludeTrack(trackId: string) {
  const lower = trackId.toLowerCase()
  return MINIMAL_TRACK_PATTERNS.some(
    pattern => lower.startsWith(pattern) || lower.includes(`-${pattern}`),
  )
}

/**
 * The tracks a config's own defaultSession opens, which have to survive the
 * filter or the minimal config boots to an empty view.
 *
 * generateDefaultSessions picks the best gene track an assembly actually has --
 * ncbiRefSeq, ncbiRefSeqCurated, ncbiGene, refGene, ensGene, augustusGene,
 * xenoRefGene -- and only the first three are names the patterns above know.
 * Every UCSC assembly predating ncbiRefSeq therefore opened a track the minimal
 * config had dropped, which was 134 of the 238: hg18 and mm9 named refGene,
 * danRer4 ensGene, the invertebrates augustusGene or xenoRefGene. Deriving the
 * exception from the session rather than restating the priority list keeps the
 * two from drifting apart again.
 */
export function minimalTracks(config: JBrowseConfig) {
  const sessionTrackIds = new Set<string>()
  for (const view of config.defaultSession?.views ?? []) {
    for (const trackId of view.init.tracks) {
      sessionTrackIds.add(trackId)
    }
  }
  return config.tracks
    .filter(
      track =>
        shouldIncludeTrack(track.trackId) || sessionTrackIds.has(track.trackId),
    )
    .map(({ category, ...rest }) => rest)
}

/**
 * Creates a minimal version of a config file by filtering tracks
 * to only include those matching the minimal track patterns.
 */
function createMinimalConfig(inputPath: string, outputPath: string) {
  const config = readConfig(inputPath)

  const originalTrackCount = config.tracks.length
  config.tracks = minimalTracks(config)
  const newTrackCount = config.tracks.length

  writeJSON(outputPath, config)

  return {
    included: newTrackCount,
    excluded: originalTrackCount - newTrackCount,
  }
}

/**
 * Processes all assembly directories in the results directory
 */
function processAssemblyDirs(resultsDir: string) {
  const entries = fs.readdirSync(resultsDir, { withFileTypes: true })
  const assemblyDirs = entries.filter(entry => entry.isDirectory())

  let totalIncluded = 0
  let totalExcluded = 0
  let processedCount = 0

  for (const dir of assemblyDirs) {
    // Skip non-assembly directories
    if (dir.name === 'trix') {
      continue
    }

    const assemblyPath = path.join(resultsDir, dir.name)
    const configPath = path.join(assemblyPath, 'config.json')
    const minimalPath = path.join(assemblyPath, 'minimal.json')

    // Skip if config.json doesn't exist
    if (!fs.existsSync(configPath)) {
      continue
    }

    try {
      const stats = createMinimalConfig(configPath, minimalPath)
      totalIncluded += stats.included
      totalExcluded += stats.excluded
      processedCount++
      console.log(
        `${dir.name}: ${stats.included} tracks included, ${stats.excluded} tracks excluded`,
      )
    } catch (e) {
      console.error(`Error processing ${dir.name}:`, e)
    }
  }

  console.log('\n--- Summary ---')
  console.log(`Total assemblies processed: ${processedCount}`)
  console.log(`Total tracks included: ${totalIncluded}`)
  console.log(`Total tracks excluded: ${totalExcluded}`)
}

// CLI
// same guard as removeEverythingButLatest.ts, so the track filter can be
// imported and tested without the CLI running on import
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length < 3) {
    console.error('Usage: node createMinimalConfig.ts <resultsDir>')
    console.error(
      '  resultsDir: Path to UCSC results directory containing assembly folders',
    )
    console.error('  Each assembly folder should contain a config.json file')
    console.error(
      '  Minimal configs will be created as minimal.json in each folder',
    )
    process.exit(1)
  }

  const resultsDir = process.argv[2]!

  if (!fs.existsSync(resultsDir)) {
    console.error(`Error: Results directory does not exist: ${resultsDir}`)
    process.exit(1)
  }

  if (!fs.statSync(resultsDir).isDirectory()) {
    console.error(`Error: Path is not a directory: ${resultsDir}`)
    process.exit(1)
  }

  processAssemblyDirs(resultsDir)
}
