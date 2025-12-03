#!/usr/bin/env node
/* eslint-disable no-console */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface SyntenyTrack {
  trackId: string
  name: string
  type: string
  assemblyNames: string[]
  configFile: string
  adapter?: unknown
  metadata?: unknown
}

interface Config {
  tracks?: {
    type?: string
    trackId?: string
    name?: string
    assemblyNames?: string[]
    adapter?: unknown
    metadata?: unknown
  }[]
}

interface SyntenyDataset {
  trackId: string
  name: string
  assemblyNames: string[]
  configFile: string
  adapter?: unknown
  metadata?: unknown
}

async function* walkDirectory(
  dir: string,
  pattern: string,
): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      yield* walkDirectory(path, pattern)
    } else if (entry.isFile() && entry.name === pattern) {
      yield path
    }
  }
}

async function extractSyntenyTracksFromFile(
  filePath: string,
): Promise<SyntenyDataset[]> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const config: Config = JSON.parse(content)

    if (!config.tracks || !Array.isArray(config.tracks)) {
      return []
    }

    return config.tracks
      .filter((track): track is SyntenyTrack => track.type === 'SyntenyTrack')
      .map(track => ({
        trackId: track.trackId,
        name: track.name,
        assemblyNames: track.assemblyNames,
        configFile: filePath,
        adapter: track.adapter,
        metadata: track.metadata,
      }))
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error)
    return []
  }
}

async function scanDirectory(
  dir: string,
  pattern: string,
): Promise<SyntenyDataset[]> {
  const allTracks: SyntenyDataset[] = []

  for await (const filePath of walkDirectory(dir, pattern)) {
    const tracks = await extractSyntenyTracksFromFile(filePath)
    allTracks.push(...tracks)
  }

  return allTracks
}

async function scanJsonFiles(dir: string): Promise<SyntenyDataset[]> {
  const allTracks: SyntenyDataset[] = []

  try {
    const files = await readdir(dir)

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = join(dir, file)
        const tracks = await extractSyntenyTracksFromFile(filePath)
        allTracks.push(...tracks)
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error)
  }

  return allTracks
}

async function main() {
  console.log('Scanning for SyntenyTrack datasets...\n')

  // Scan hubs/ directory for config.json files
  console.log('Scanning hubs/ directory...')
  const hubsTracks = await scanDirectory('hubs', 'config.json')
  console.log(`Found ${hubsTracks.length} SyntenyTrack entries in hubs/\n`)

  // Scan ucsc2jbrowse/configs/ directory for .json files
  console.log('Scanning ucsc2jbrowse/configs/ directory...')
  const ucscTracks = await scanJsonFiles('ucsc2jbrowse/configs')
  console.log(
    `Found ${ucscTracks.length} SyntenyTrack entries in ucsc2jbrowse/configs/\n`,
  )

  // Combine all tracks
  const allTracks = [...hubsTracks, ...ucscTracks]
  console.log(`Total SyntenyTrack entries found: ${allTracks.length}\n`)

  // Write to output file
  const outputFile = 'website/src/syntenyTracks.json'
  await writeFile(outputFile, JSON.stringify(allTracks, null, 2))
  console.log(`Results written to ${outputFile}`)

  // Generate summary statistics
  const assemblyPairs = new Map<string, number>()
  for (const track of allTracks) {
    if (track.assemblyNames.length === 2) {
      const pair = track.assemblyNames.slice().sort().join(' <-> ')
      assemblyPairs.set(pair, (assemblyPairs.get(pair) || 0) + 1)
    }
  }

  console.log(`\nUnique assembly pairs: ${assemblyPairs.size}`)
  console.log('\nTop 10 most common assembly pairs:')
  const sortedPairs = [...assemblyPairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  for (const [pair, count] of sortedPairs) {
    console.log(`  ${pair}: ${count} tracks`)
  }
}

main().catch(console.error)
