/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

import { Command } from 'commander'

import { readJSON, writeJSON } from './util.ts'

import type { JBrowseConfig } from './types.ts'

interface ChainTrack {
  type: string
  trackId: string
  name: string
  category: string[]
  assemblyNames: string[]
  adapter: {
    type: string
    targetAssembly: string
    queryAssembly: string
    pifGzLocation: { uri: string }
    index: { location: { uri: string }; indexType?: string }
  }
}

/**
 * Creates a chain track configuration object from a PIF file.
 * @param pifFile The name of the PIF file (e.g., 'hg19ToHg38.over.pif.gz' or 'hg19.hg38.pif.gz').
 * @param sourceAssembly The source assembly name (e.g., 'hg19').
 * @param srcDir The source directory for the PIF files (e.g., 'liftOver' or 'vs').
 * @returns A ChainTrack object or null if parsing fails.
 */
function createChainTrackConfig({
  pifFile,
  sourceAssembly,
  srcDir,
}: {
  pifFile: string
  sourceAssembly: string
  srcDir: string
}): ChainTrack | null {
  const filename = path.basename(pifFile)
  const filenameWithoutExt = filename.replace('.pif.gz', '')

  // Example: hg19ToHg38.over or hg19.hg38.all
  let match = /^(.+?)To(.+?)\.over$/.exec(filenameWithoutExt)
  if (!match?.[1] || !match[2]) {
    // Try alternative format: hg19.hg38.all
    match = /^(.+?)\.(.+?)$/.exec(filenameWithoutExt)
    if (!match?.[1] || !match[2]) {
      console.warn(`Warning: Could not parse filename format for ${filename}`)
      return null
    }
  }

  const targetAssemblyOrig = match[2]
  let targetAssembly: string

  // Handle cases like GCF_... or GCA_... accessions
  if (
    targetAssemblyOrig.startsWith('GCF') ||
    targetAssemblyOrig.startsWith('GCA')
  ) {
    targetAssembly = targetAssemblyOrig
  } else {
    // Convert first letter to lowercase for typical UCSC assembly names
    targetAssembly =
      targetAssemblyOrig.charAt(0).toLowerCase() + targetAssemblyOrig.slice(1)
  }

  let commonName = ''
  // Try to get common name from processedHubJson/all.json for GCF/GCA accessions
  if (
    targetAssemblyOrig.startsWith('GCF') ||
    targetAssemblyOrig.startsWith('GCA')
  ) {
    try {
      const allJson = readJSON<any>('../website/processedHubJson/all.json')
      const assembly = allJson.find(
        (a: any) => a?.accession === targetAssemblyOrig,
      )
      commonName = assembly?.commonName ?? ''
    } catch (error) {
      console.warn(
        `Warning: Could not read assembly information for ${targetAssemblyOrig}: ${error}`,
      )
    }
  } else {
    // Try to get common name from ucscResults/list.json for typical UCSC assemblies
    try {
      const ucscResultsDir = process.env.UCSC_BUILT_DIR
      if (!ucscResultsDir) {
        throw new Error('No UCSC_BUILT_DIR env defined')
      }
      const listJson = readJSON<any>(path.join(ucscResultsDir, 'list.json'))
      commonName = listJson.ucscGenomes?.[targetAssembly]?.organism ?? ''
    } catch (error) {
      console.warn(
        `Warning: Could not read organism information for ${targetAssembly}`,
      )
    }
  }

  const trackId = `${sourceAssembly}_to_${targetAssembly}_${srcDir}`
  const trackName = commonName
    ? `${sourceAssembly} to ${commonName} (${targetAssembly}) ${srcDir}`
    : `${sourceAssembly} to ${targetAssembly} ${srcDir}`

  return {
    type: 'SyntenyTrack',
    trackId,
    name: trackName,
    category: ['Pairwise alignments', srcDir],
    assemblyNames: [sourceAssembly, targetAssembly],
    adapter: {
      type: 'PairwiseIndexedPAFAdapter',
      targetAssembly: sourceAssembly,
      queryAssembly: targetAssembly,
      pifGzLocation: { uri: `${srcDir}/${filename}` },
      index: {
        location: { uri: `${srcDir}/${filename}.csi` },
        indexType: 'CSI',
      },
    },
  }
}

/**
 * Main function to update the JBrowse configuration with chain tracks.
 * It reads PIF files from a specified source directory and adds corresponding
 * SyntenyTrack entries to the config.json.
 */
function main() {
  const program = new Command()

  program
    .option(
      '-a, --assembly <assembly>',
      'Source assembly name (e.g., hg19, hg38, mm10)',
    )
    .option(
      '-s, --source <source_dir>',
      'Either liftOver or vs, the source directory for PIF files',
    )
    .option(
      '-o, --output <dir>',
      'Output directory',
      process.env.UCSC_BUILT_DIR,
    )
    .parse(process.argv)

  const options = program.opts()
  const sourceAssembly: string = options.assembly
  const outDir: string = options.output
  const srcDir: string = options.source

  // Skip non-assembly directories
  if (sourceAssembly === 'trix') {
    return
  }

  const configDir = path.join(outDir, sourceAssembly)
  const configFile = path.join(configDir, 'config.json')

  // Ensure config file exists, create with empty tracks array if not
  if (!fs.existsSync(configFile)) {
    writeJSON(configFile, { tracks: [] })
  }

  const pifFilesDir = path.join(configDir, srcDir)
  if (!fs.existsSync(pifFilesDir)) {
    console.log(`Creating PIF files directory: ${pifFilesDir}`)
    fs.mkdirSync(pifFilesDir, { recursive: true })
  }

  const pifFiles = fs
    .readdirSync(pifFilesDir)
    .filter(file => file.endsWith('.pif.gz'))

  if (pifFiles.length === 0) {
    // console.log(`No PIF files found in ${pifFilesDir}`)
    return
  }

  const chainTracks: ChainTrack[] = []

  for (const pifFile of pifFiles) {
    const track = createChainTrackConfig({
      pifFile,
      sourceAssembly,
      srcDir,
    })
    if (track) {
      chainTracks.push(track)
    }
  }

  const config = readJSON<JBrowseConfig>(configFile)
  // Deduplicate tracks by trackId to avoid adding duplicates if script is run
  // multiple times
  const existingTrackIds = new Set(config.tracks.map(t => t.trackId))

  writeJSON(configFile, {
    ...config,
    tracks: [
      ...config.tracks,
      ...chainTracks.filter(t => !existingTrackIds.has(t.trackId)),
    ],
  })
}

main()
