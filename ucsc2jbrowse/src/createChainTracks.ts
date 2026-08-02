import fs from 'fs'
import { parseArgs } from 'node:util'
import path from 'path'

import { isAccession, normalizeAssemblyName } from 'hubtools'

import { readJSON, writeJSON } from './util.ts'

import type { JBrowseConfig } from './types.ts'
import type { ChainTrack } from 'hubtools'

// Pre-load lookup tables once instead of re-reading per PIF file
const allJsonIndex = new Map<string, string>()
try {
  const allJson = readJSON<{ accession: string; commonName?: string }[]>(
    '../genark2jbrowse/processedHubJson/all.json',
  )
  for (const entry of allJson) {
    if (entry.accession && entry.commonName) {
      allJsonIndex.set(entry.accession, entry.commonName)
    }
  }
} catch {
  console.warn('Warning: could not load genark processedHubJson/all.json')
}

const ucscListJson: Record<string, { organism?: string }> = {}
try {
  const ucscResultsDir = process.env.UCSC_BUILT_DIR
  if (ucscResultsDir) {
    const listJson = readJSON<{
      ucscGenomes: Record<string, { organism?: string }>
    }>(path.join(ucscResultsDir, 'list.json'))
    Object.assign(ucscListJson, listJson.ucscGenomes)
  }
} catch {
  console.warn('Warning: could not load ucsc list.json')
}

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

  // .chainBridge is a method qualifier in UCSC filenames, not part of the
  // assembly name. Strip it but preserve it in the track ID/name suffix so
  // chainBridge tracks remain distinct from regular liftOver tracks for the
  // same assembly pair.
  const isChainBridge = match[2].endsWith('.chainBridge')
  const targetAssemblyOrig = isChainBridge
    ? match[2].slice(0, -'.chainBridge'.length)
    : match[2]
  const targetAssembly = normalizeAssemblyName(targetAssemblyOrig)

  const trackSrcDir = isChainBridge ? `${srcDir}_chainBridge` : srcDir

  const commonName = isAccession(targetAssemblyOrig)
    ? (allJsonIndex.get(targetAssemblyOrig) ?? '')
    : (ucscListJson[targetAssembly]?.organism ?? '')

  const trackId = `${sourceAssembly}_to_${targetAssembly}_${trackSrcDir}`
  const trackName = commonName
    ? `${sourceAssembly} to ${commonName} (${targetAssembly}) ${trackSrcDir}`
    : `${sourceAssembly} to ${targetAssembly} ${trackSrcDir}`

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

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      assembly: { type: 'string', short: 'a' },
      source: { type: 'string', short: 's' },
      output: {
        type: 'string',
        short: 'o',
        default: process.env.UCSC_BUILT_DIR,
      },
    },
  })

  const sourceAssembly = values.assembly
  const outDir = values.output
  const srcDir = values.source

  if (!sourceAssembly || !outDir || !srcDir) {
    throw new Error('--assembly, --source, and --output are required')
  }

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
