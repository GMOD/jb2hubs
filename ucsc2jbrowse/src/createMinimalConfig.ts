/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

import { readConfig, writeJSON } from './util.ts'

/**
 * Track categories to include in minimal configs.
 * These are matched against the trackId (case-insensitive).
 */
const MINIMAL_TRACK_PATTERNS = [
  'ncbirefseq', // NCBI RefSeq tracks
  'gencode', // GENCODE tracks
  'rmsk', // RepeatMasker tracks
  'gap', // Gap tracks (gap, allGaps, gapOverlap)
]

/**
 * Checks if a track should be included in the minimal config
 * based on its trackId matching any of the minimal track patterns.
 */
function shouldIncludeTrack(trackId: string): boolean {
  const lowerTrackId = trackId.toLowerCase()
  return MINIMAL_TRACK_PATTERNS.some(pattern => lowerTrackId.includes(pattern))
}

/**
 * Creates a minimal version of a config file by filtering tracks
 * to only include those matching the minimal track patterns.
 */
function createMinimalConfig(
  inputPath: string,
  outputPath: string,
): { included: number; excluded: number } {
  const config = readConfig(inputPath)

  const originalTrackCount = config.tracks.length
  config.tracks = config.tracks
    .filter(track => shouldIncludeTrack(track.trackId))
    .map(({ category, ...rest }) => rest)
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
