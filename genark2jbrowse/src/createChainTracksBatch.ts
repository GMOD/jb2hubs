import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

import { readJSON, writeJSON } from 'hubtools'

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

// Cache lookups that were repeated per-invocation
const allJsonPath = path.join(process.cwd(), 'processedHubJson/all.json')
const allJsonIndex = new Map<string, string>()
try {
  const allJson = JSON.parse(fs.readFileSync(allJsonPath, 'utf8'))
  for (const entry of allJson) {
    if (entry?.accession && entry?.commonName) {
      allJsonIndex.set(entry.accession, entry.commonName)
    }
  }
} catch {
  console.error('Warning: could not load processedHubJson/all.json')
}

const ucscDisplayNames = new Map<string, string>()

function getUcscDisplayName(assembly: string) {
  if (ucscDisplayNames.has(assembly)) {
    return ucscDisplayNames.get(assembly)!
  }
  let name = ''
  try {
    const configPath = path.join(
      process.cwd(),
      '../ucsc2jbrowse/configs',
      `${assembly}.json`,
    )
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      name = config.assemblies?.[0]?.displayName ?? ''
    }
  } catch {
    // ignore
  }
  ucscDisplayNames.set(assembly, name)
  return name
}

function parseTargetAssembly(filename: string) {
  let match = /^(.+?)To(.+?)$/.exec(filename)
  if (!match?.[1] || !match[2]) {
    match = /^(.+?)\.(.+?)$/.exec(filename)
    if (!match?.[1] || !match[2]) {
      return null
    }
  }
  return match[2]
}

function normalizeAssemblyName(name: string) {
  if (name.startsWith('GCF') || name.startsWith('GCA')) {
    return name
  }
  return name.charAt(0).toLowerCase() + name.slice(1)
}

function getTargetCommonName(target: string, isGenArk: boolean) {
  if (isGenArk) {
    return allJsonIndex.get(target) ?? ''
  }
  return getUcscDisplayName(target)
}

function processOne(metaPath: string) {
  if (!fs.existsSync(metaPath)) {
    return
  }

  const configDir = path.dirname(metaPath)
  const configFile = path.join(configDir, 'config.json')
  if (!fs.existsSync(configFile)) {
    return
  }

  const liftOverDir = path.join(configDir, 'liftOver')
  if (!fs.existsSync(liftOverDir)) {
    return
  }

  const pifFiles = fs
    .readdirSync(liftOverDir)
    .filter(f => f.endsWith('.pif.gz'))
  if (pifFiles.length === 0) {
    return
  }

  const meta = readJSON<{
    accession: string
    commonName?: string
    scientificName?: string
  }>(metaPath)
  const sourceAccession = meta.accession
  const sourceCommonName = meta.commonName ?? meta.scientificName ?? ''

  const chainTracks: ChainTrack[] = []
  for (const pifFile of pifFiles) {
    const base = pifFile.replace('.pif.gz', '')
    const targetOrig = parseTargetAssembly(base)
    if (!targetOrig) {
      continue
    }
    const target = normalizeAssemblyName(targetOrig)
    const isGenArk =
      targetOrig.startsWith('GCF') || targetOrig.startsWith('GCA')
    const targetCommon = getTargetCommonName(target, isGenArk)

    const trackId = `${sourceAccession}_to_${target}_liftOver`
    const name = targetCommon
      ? `${sourceAccession} (${sourceCommonName}) to ${targetCommon} liftOver`
      : `${sourceAccession} to ${target} liftOver`

    chainTracks.push({
      type: 'SyntenyTrack',
      trackId,
      name,
      category: ['Pairwise alignments', 'liftOver'],
      assemblyNames: [sourceAccession, target],
      adapter: {
        type: 'PairwiseIndexedPAFAdapter',
        targetAssembly: sourceAccession,
        queryAssembly: target,
        pifGzLocation: { uri: `liftOver/${pifFile}` },
        index: {
          location: { uri: `liftOver/${pifFile}.csi` },
          indexType: 'CSI',
        },
      },
    })
  }

  if (chainTracks.length === 0) {
    return
  }

  const config = readJSON<{ tracks: ChainTrack[] }>(configFile)
  const existingIds = new Set(config.tracks.map(t => t.trackId))
  const newTracks = chainTracks.filter(t => !existingIds.has(t.trackId))

  if (newTracks.length > 0) {
    writeJSON(configFile, {
      ...config,
      tracks: [...config.tracks, ...newTracks],
    })
  }
}

const rl = readline.createInterface({ input: process.stdin })
let processed = 0

for await (const line of rl) {
  const metaPath = line.trim()
  if (!metaPath) {
    continue
  }
  try {
    processOne(metaPath)
    processed++
    if (processed % 5000 === 0) {
      console.error(`  ${processed} processed`)
    }
  } catch (error) {
    console.error(`Error processing ${metaPath}: ${error}`)
  }
}

console.error(`Processed ${processed} assemblies for chain tracks`)
