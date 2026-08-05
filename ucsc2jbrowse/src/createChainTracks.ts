import fs from 'fs'
import { parseArgs } from 'node:util'
import path from 'path'
import * as readline from 'readline'

import { isAccession, normalizeAssemblyName } from 'hubtools'

import { readJSON, writeJSON } from './util.ts'

import type { JBrowseConfig } from './types.ts'
import type { ChainTrack } from 'hubtools'

// Display-name lookups, loaded at most once per process and only when a PIF
// filename actually needs one. Both files are large -- genark's all.json is
// ~73MB -- and a typical UCSC assembly's liftOver targets are all UCSC db names,
// so the accession table is usually never touched at all. This used to be a
// module-level load in a script invoked once per assembly, which parsed all.json
// ~250 times per build (1.7s and 326MB apiece) to build the same small map.
let allJsonIndex: Map<string, string> | undefined

function getAccessionCommonName(accession: string) {
  if (!allJsonIndex) {
    allJsonIndex = new Map()
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
  }
  return allJsonIndex.get(accession) ?? ''
}

let ucscListJson: Record<string, { organism?: string }> | undefined

function getUcscOrganism(assembly: string) {
  if (!ucscListJson) {
    ucscListJson = {}
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
  }
  return ucscListJson[assembly]?.organism ?? ''
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
    ? getAccessionCommonName(targetAssemblyOrig)
    : getUcscOrganism(targetAssembly)

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

function processAssembly({
  sourceAssembly,
  outDir,
  srcDir,
}: {
  sourceAssembly: string
  outDir: string
  srcDir: string
}) {
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

// Reads the assembly names to process: either the single --assembly given on
// the command line, or one name per line on stdin. The stdin form is what
// makePifs.sh uses, so the whole build is one process rather than one per
// assembly re-reading the same lookup tables.
async function readAssemblyNames(single: string | undefined) {
  if (single) {
    return [single]
  }
  const names: string[] = []
  const rl = readline.createInterface({ input: process.stdin })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (trimmed) {
      names.push(trimmed)
    }
  }
  return names
}

async function main() {
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

  const outDir = values.output
  const srcDir = values.source

  if (!outDir || !srcDir) {
    throw new Error('--source and --output are required')
  }

  const assemblies = await readAssemblyNames(values.assembly)

  let processed = 0
  for (const sourceAssembly of assemblies) {
    try {
      processAssembly({ sourceAssembly, outDir, srcDir })
      processed++
    } catch (error) {
      console.error(`Error processing ${sourceAssembly}: ${error}`)
    }
  }

  console.error(`Added chain tracks for ${processed} assemblies`)
}

await main()
