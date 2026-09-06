import fs from 'fs'
import path from 'path'

import { isAccession, normalizeAssemblyName } from 'hubtools'

import { readJSON } from './util.ts'

import type { UcscTrack } from './types.ts'
import type { FinalizeStep } from './utils/finalizeStep.ts'

// genark's all.json is ~73MB, and a typical UCSC assembly's liftOver targets
// are all UCSC db names, so the accession table is loaded at most once per
// process and only when a PIF filename actually names an accession.
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

const SRC_DIR = 'liftOver'

function createChainTrackConfig({
  pifFile,
  sourceAssembly,
  ucscOrganism,
}: {
  pifFile: string
  sourceAssembly: string
  ucscOrganism: (db: string) => string
}): UcscTrack | undefined {
  const filenameWithoutExt = pifFile.replace('.pif.gz', '')

  // Example: hg19ToHg38.over or hg19.hg38.all
  let match = /^(.+?)To(.+?)\.over$/.exec(filenameWithoutExt)
  if (!match?.[1] || !match[2]) {
    match = /^(.+?)\.(.+?)$/.exec(filenameWithoutExt)
    if (!match?.[1] || !match[2]) {
      console.warn(`Warning: Could not parse filename format for ${pifFile}`)
      return undefined
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
  const trackSrcDir = isChainBridge ? `${SRC_DIR}_chainBridge` : SRC_DIR

  // both lookups take the NORMALIZED name: all.json is keyed by bare accession,
  // so an asmId-spelled target (dm6ToGCA_003448975.1_ASM344897v1) found nothing
  const commonName = isAccession(targetAssemblyOrig)
    ? getAccessionCommonName(targetAssembly)
    : ucscOrganism(targetAssembly)

  const trackId = `${sourceAssembly}_to_${targetAssembly}_${trackSrcDir}`
  return {
    type: 'SyntenyTrack',
    trackId,
    name: commonName
      ? `${sourceAssembly} to ${commonName} (${targetAssembly}) ${trackSrcDir}`
      : `${sourceAssembly} to ${targetAssembly} ${trackSrcDir}`,
    category: ['Pairwise alignments', SRC_DIR],
    assemblyNames: [sourceAssembly, targetAssembly],
    adapter: {
      type: 'PairwiseIndexedPAFAdapter',
      targetAssembly: sourceAssembly,
      queryAssembly: targetAssembly,
      pifGzLocation: { uri: `${SRC_DIR}/${pifFile}` },
      index: {
        location: { uri: `${SRC_DIR}/${pifFile}.csi` },
        indexType: 'CSI',
      },
    },
  }
}

/**
 * A SyntenyTrack per liftOver PIF createChainTrackPifs.sh built under
 * `<dir>/liftOver/`, named after the target's species. The organism lookup is
 * injected so the step needs no list.json of its own.
 */
export function addChainTracks(
  ucscOrganism: (db: string) => string,
): FinalizeStep {
  return {
    name: 'liftOver synteny tracks',
    run: ({ assemblyName, dir, config }) => {
      const counts: Record<string, number> = {}
      const pifDir = path.join(dir, SRC_DIR)
      if (fs.existsSync(pifDir)) {
        const existing = new Set(config.tracks.map(t => t.trackId))
        const added = fs
          .readdirSync(pifDir)
          .filter(f => f.endsWith('.pif.gz'))
          .sort()
          .map(pifFile =>
            createChainTrackConfig({
              pifFile,
              sourceAssembly: assemblyName,
              ucscOrganism,
            }),
          )
          .filter(
            (t): t is UcscTrack => t !== undefined && !existing.has(t.trackId),
          )
        if (added.length > 0) {
          config.tracks.push(...added)
          counts.added = added.length
        }
      }
      return counts
    },
  }
}
