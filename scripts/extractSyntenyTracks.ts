#!/usr/bin/env node
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

interface Assembly {
  name: string
  displayName?: string
  sequence?: {
    metadata?: {
      commonName?: string
      scientificName?: string
      organism?: string
    }
  }
}

interface Config {
  assemblies?: Assembly[]
  tracks?: {
    type?: string
    trackId?: string
    name?: string
    assemblyNames?: string[]
    adapter?: unknown
    metadata?: unknown
  }[]
}

interface AssemblyInfo {
  commonName?: string
  scientificName?: string
  source: 'ucsc' | 'genark' | 'legacy'
  // NCBI taxonomy id, used to map assemblies to the cross-species ortholog
  // tables. Only populated for GenArk assemblies (from all.json).
  taxonId?: number
}

interface SyntenyDataset {
  trackId: string
  name: string
  assemblyNames: string[]
  configFile: string
  adapter?: unknown
  metadata?: unknown
}

interface SyntenyOutput {
  tracks: SyntenyDataset[]
  assemblyInfo: Record<string, AssemblyInfo>
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

interface ExtractionResult {
  tracks: SyntenyDataset[]
  assemblyInfo: Record<string, Omit<AssemblyInfo, 'source'>>
}

async function extractSyntenyTracksFromFile(
  filePath: string,
): Promise<ExtractionResult> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const config: Config = JSON.parse(content)

    const assemblyInfo: Record<string, Omit<AssemblyInfo, 'source'>> = {}

    if (config.assemblies && Array.isArray(config.assemblies)) {
      for (const asm of config.assemblies) {
        const meta = asm.sequence?.metadata
        const displayName = asm.displayName
        if (meta?.commonName || meta?.scientificName || displayName) {
          assemblyInfo[asm.name] = {
            commonName: meta?.commonName ?? meta?.organism ?? displayName,
            scientificName: meta?.scientificName,
          }
        }
      }
    }

    if (!config.tracks || !Array.isArray(config.tracks)) {
      return { tracks: [], assemblyInfo }
    }

    const tracks = config.tracks
      .filter((track): track is SyntenyTrack => track.type === 'SyntenyTrack')
      .map(track => ({
        trackId: track.trackId,
        name: track.name,
        assemblyNames: track.assemblyNames,
        configFile: filePath,
        adapter: track.adapter,
        metadata: track.metadata,
      }))

    return { tracks, assemblyInfo }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error)
    return { tracks: [], assemblyInfo: {} }
  }
}

async function scanDirectory(
  dir: string,
  pattern: string,
): Promise<ExtractionResult> {
  const allTracks: SyntenyDataset[] = []
  const allAssemblyInfo: Record<string, AssemblyInfo> = {}

  for await (const filePath of walkDirectory(dir, pattern)) {
    const result = await extractSyntenyTracksFromFile(filePath)
    allTracks.push(...result.tracks)
    Object.assign(allAssemblyInfo, result.assemblyInfo)
  }

  return { tracks: allTracks, assemblyInfo: allAssemblyInfo }
}

async function scanJsonFiles(dir: string): Promise<ExtractionResult> {
  const allTracks: SyntenyDataset[] = []
  const allAssemblyInfo: Record<string, AssemblyInfo> = {}

  try {
    const files = await readdir(dir)

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = join(dir, file)
        const result = await extractSyntenyTracksFromFile(filePath)
        allTracks.push(...result.tracks)
        Object.assign(allAssemblyInfo, result.assemblyInfo)
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error)
  }

  return { tracks: allTracks, assemblyInfo: allAssemblyInfo }
}

async function loadGenArkAssemblyInfo(): Promise<Record<string, AssemblyInfo>> {
  const result: Record<string, AssemblyInfo> = {}
  try {
    const content = await readFile('website/processedHubJson/all.json', 'utf-8')
    const assemblies = JSON.parse(content) as {
      accession: string
      commonName?: string
      scientificName?: string
      taxonId?: number
    }[]
    for (const asm of assemblies) {
      if (asm.accession) {
        result[asm.accession] = {
          commonName: asm.commonName,
          scientificName: asm.scientificName,
          source: 'genark',
          taxonId: asm.taxonId,
        }
      }
    }
    console.log(`Loaded ${Object.keys(result).length} GenArk assembly records`)
  } catch (error) {
    console.error('Error loading GenArk assembly info:', error)
  }
  return result
}

// Retired UCSC assemblies that the live API no longer lists, so their synteny
// tracks would otherwise render with a bare db name. Pure data, kept beside the
// script rather than inline: it was 422 of this file's lines.
const legacyUcscAssemblies: Record<
  string,
  Omit<AssemblyInfo, 'source'>
> = JSON.parse(
  await readFile(
    join(import.meta.dirname, 'legacyUcscAssemblies.json'),
    'utf-8',
  ),
)

async function loadUcscAssemblyInfo(): Promise<Record<string, AssemblyInfo>> {
  const result: Record<string, AssemblyInfo> = {}
  try {
    console.log('Fetching UCSC assembly metadata from API...')
    const response = await fetch('https://api.genome.ucsc.edu/list/ucscGenomes')
    const data = (await response.json()) as {
      ucscGenomes: Record<
        string,
        { organism?: string; scientificName?: string }
      >
    }
    for (const [name, info] of Object.entries(data.ucscGenomes)) {
      result[name] = {
        commonName: info.organism,
        scientificName: info.scientificName,
        source: 'ucsc',
      }
    }
    console.log(`Loaded ${Object.keys(result).length} UCSC assembly records`)
  } catch (error) {
    console.error('Error loading UCSC assembly info:', error)
  }
  return result
}

async function main() {
  console.log('Scanning for SyntenyTrack datasets...\n')

  // Load assembly info from external sources
  const genArkInfo = await loadGenArkAssemblyInfo()
  const ucscInfo = await loadUcscAssemblyInfo()

  // Scan hubs/ directory for config.json files
  console.log('Scanning hubs/ directory...')
  const hubsResult = await scanDirectory('hubs', 'config.json')
  console.log(
    `Found ${hubsResult.tracks.length} SyntenyTrack entries in hubs/\n`,
  )

  // Scan ucsc2jbrowse/configs/ directory for .json files
  console.log('Scanning ucsc2jbrowse/configs/ directory...')
  const ucscResult = await scanJsonFiles('ucsc2jbrowse/configs')
  console.log(
    `Found ${ucscResult.tracks.length} SyntenyTrack entries in ucsc2jbrowse/configs/\n`,
  )

  // Combine all tracks
  const allTracks = [...hubsResult.tracks, ...ucscResult.tracks]
  console.log(`Total SyntenyTrack entries found: ${allTracks.length}\n`)

  // Build legacy assembly info with source
  const legacyInfo: Record<string, AssemblyInfo> = {}
  for (const [name, info] of Object.entries(legacyUcscAssemblies)) {
    legacyInfo[name] = { ...info, source: 'legacy' }
  }

  // Add source to hub assembly info (genark)
  const hubsAssemblyInfo: Record<string, AssemblyInfo> = {}
  for (const [name, info] of Object.entries(hubsResult.assemblyInfo)) {
    hubsAssemblyInfo[name] = { ...info, source: 'genark' }
  }

  // Add source to ucsc config assembly info
  const ucscConfigAssemblyInfo: Record<string, AssemblyInfo> = {}
  for (const [name, info] of Object.entries(ucscResult.assemblyInfo)) {
    ucscConfigAssemblyInfo[name] = { ...info, source: 'ucsc' }
  }

  // Combine assembly info from all sources (later sources override earlier)
  const assemblyInfo: Record<string, AssemblyInfo> = {
    ...legacyInfo,
    ...genArkInfo,
    ...ucscInfo,
    ...hubsAssemblyInfo,
    ...ucscConfigAssemblyInfo,
  }
  console.log(
    `Total assembly info records: ${Object.keys(assemblyInfo).length}`,
  )

  // Backfill taxonId for assemblies that lack it (UCSC, legacy) by matching
  // scientificName against the GenArk assemblies that carry one. This lets
  // same-species comparisons such as hg19 vs hg38 (both Homo sapiens) reach the
  // ortholog tables, which are keyed by taxon.
  const sciNameToTaxon = new Map<string, number>()
  for (const info of Object.values(assemblyInfo)) {
    if (info.taxonId !== undefined && info.scientificName) {
      sciNameToTaxon.set(info.scientificName.toLowerCase(), info.taxonId)
    }
  }
  let backfilled = 0
  for (const info of Object.values(assemblyInfo)) {
    if (info.taxonId === undefined && info.scientificName) {
      const taxon = sciNameToTaxon.get(info.scientificName.toLowerCase())
      if (taxon !== undefined) {
        info.taxonId = taxon
        backfilled++
      }
    }
  }
  console.log(`Backfilled taxonId for ${backfilled} assemblies via name`)

  // Check for assemblies without info
  const allAssemblyNames = new Set<string>()
  for (const track of allTracks) {
    for (const name of track.assemblyNames) {
      allAssemblyNames.add(name)
    }
  }
  const missingInfo = [...allAssemblyNames].filter(name => !assemblyInfo[name])
  console.log(`Assemblies without info: ${missingInfo.length}`)
  if (missingInfo.length > 0 && missingInfo.length <= 20) {
    console.log(`  ${missingInfo.join(', ')}`)
  }

  // Write output with both tracks and assembly info
  const output: SyntenyOutput = { tracks: allTracks, assemblyInfo }
  const outputFile = 'website/src/syntenyTracks.json'
  await writeFile(outputFile, JSON.stringify(output, null, 2))
  console.log(`\nResults written to ${outputFile}`)

  // Lightweight list of GCA/GCF accessions that take part in a launchable
  // synteny track (both sides non-legacy). The accession pages import this
  // instead of the multi-megabyte syntenyTracks.json.
  const launchableAccessions = new Set<string>()
  for (const track of allTracks) {
    const usable = track.assemblyNames.every(name => {
      const info = assemblyInfo[name]
      return info && info.source !== 'legacy'
    })
    if (usable) {
      for (const name of track.assemblyNames) {
        if (name.startsWith('GCA_') || name.startsWith('GCF_')) {
          launchableAccessions.add(name)
        }
      }
    }
  }
  const accessionsFile = 'website/src/syntenyAccessions.json'
  await writeFile(
    accessionsFile,
    JSON.stringify([...launchableAccessions].sort()),
  )
  console.log(
    `Wrote ${launchableAccessions.size} synteny accessions to ${accessionsFile}`,
  )

  // Generate summary statistics
  const assemblyPairs = new Map<string, number>()
  for (const track of allTracks) {
    if (track.assemblyNames.length === 2) {
      const pair = track.assemblyNames.slice().sort().join(' <-> ')
      assemblyPairs.set(pair, (assemblyPairs.get(pair) ?? 0) + 1)
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
