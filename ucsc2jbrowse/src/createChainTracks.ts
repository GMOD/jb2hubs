import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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

const HUBS_DIR = fileURLToPath(new URL('../../hubs', import.meta.url))
const GENARK_NIB_PREFIX = 'hub:/gbdb/genark/'

/**
 * `GCF/036/323/735/GCF_036323735.1` for a GenArk-backed alias such as rn8,
 * whose nibPath names the GenArk hub it was built from; undefined otherwise
 */
export function genarkHubPath(nibPath: unknown) {
  return typeof nibPath === 'string' && nibPath.startsWith(GENARK_NIB_PREFIX)
    ? nibPath.slice(GENARK_NIB_PREFIX.length)
    : undefined
}

/**
 * The liftOver PIFs a GenArk hub's config names. UCSC publishes a
 * GenArk-backed alias's chains only in the hub's own liftOver directory, which
 * the GenArk pipeline already turns into PIFs and uploads, so the alias names
 * those rather than building a second copy. Same assembly, same refNames.
 */
export function genarkLiftOverPifs(config: { tracks?: unknown[] }) {
  return (config.tracks ?? []).flatMap(track => {
    const { adapter } = track as {
      adapter?: { type?: string; pifGzLocation?: { uri?: string } }
    }
    const uri = adapter?.pifGzLocation?.uri
    return adapter?.type === 'PairwiseIndexedPAFAdapter' &&
      uri?.startsWith(`${SRC_DIR}/`)
      ? [uri.slice(SRC_DIR.length + 1)]
      : []
  })
}

function readGenarkLiftOverPifs(hubPath: string) {
  const file = path.join(HUBS_DIR, hubPath, 'config.json')
  return fs.existsSync(file)
    ? genarkLiftOverPifs(readJSON<{ tracks?: unknown[] }>(file))
    : []
}

/**
 * What a liftOver track calls its target: `Chimp (panTro6)` off the UCSC
 * genome list, the common name for a GenArk accession, '' when neither knows
 * it. Takes the NORMALIZED name: all.json is keyed by bare accession, so an
 * asmId-spelled target (dm6ToGCA_003448975.1_ASM344897v1) found nothing
 */
export function liftOverTargetLabel(
  target: string,
  ucscOrganism: (db: string) => string,
) {
  const commonName = isAccession(target)
    ? getAccessionCommonName(target)
    : ucscOrganism(target)
  return commonName ? `${commonName} (${target})` : ''
}

export function createChainTrackConfig({
  pifFile,
  sourceAssembly,
  sourceName = sourceAssembly,
  ucscOrganism,
  baseUri = `${SRC_DIR}/`,
}: {
  pifFile: string
  sourceAssembly: string
  /** what the track name calls the source; a GenArk-backed alias's db name */
  sourceName?: string
  ucscOrganism: (db: string) => string
  baseUri?: string
}): UcscTrack | undefined {
  const filenameWithoutExt = pifFile.replace('.pif.gz', '')

  // Example: hg19ToHg38.over, GCF_036323735.1ToHg38 (a GenArk hub's) or
  // hg19.hg38.all
  let match =
    /^(.+?)To(.+?)\.over$/.exec(filenameWithoutExt) ??
    /^(GC[AF]_\d+\.\d+)To(.+)$/.exec(filenameWithoutExt)
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

  const label = liftOverTargetLabel(targetAssembly, ucscOrganism)

  const trackId = `${sourceAssembly}_to_${targetAssembly}_${trackSrcDir}`
  return {
    type: 'SyntenyTrack',
    trackId,
    name: `${sourceName} to ${label || targetAssembly} ${trackSrcDir}`,
    category: ['Pairwise alignments', SRC_DIR],
    assemblyNames: [sourceAssembly, targetAssembly],
    adapter: {
      type: 'PairwiseIndexedPAFAdapter',
      targetAssembly: sourceAssembly,
      queryAssembly: targetAssembly,
      pifGzLocation: { uri: `${baseUri}${pifFile}` },
      index: {
        location: { uri: `${baseUri}${pifFile}.csi` },
        indexType: 'CSI',
      },
    },
  }
}

/**
 * A SyntenyTrack per liftOver PIF createChainTrackPifs.sh built under
 * `<dir>/liftOver/`, or for a GenArk-backed alias per PIF its GenArk hub
 * publishes, named after the target's species. The tracks name the config's
 * own assembly, which for an alias is the accession (see
 * ensureUcscAssemblyNames.ts). The organism lookup is injected so the step
 * needs no list.json of its own.
 */
export function addChainTracks(
  ucscOrganism: (db: string) => string,
  genarkPifs: (hubPath: string) => string[] = readGenarkLiftOverPifs,
): FinalizeStep {
  return {
    name: 'liftOver synteny tracks',
    run: ({ assemblyName, dir, config, genome }) => {
      const counts: Record<string, number> = {}
      const hubPath = genarkHubPath(genome?.nibPath)
      const pifDir = path.join(dir, SRC_DIR)
      const pifFiles = hubPath
        ? genarkPifs(hubPath)
        : fs.existsSync(pifDir)
          ? fs.readdirSync(pifDir).filter(f => f.endsWith('.pif.gz'))
          : []
      const baseUri = hubPath
        ? `https://jbrowse.org/hubs/genark/${hubPath}/${SRC_DIR}/`
        : undefined
      const existing = new Set(config.tracks.map(t => t.trackId))
      const added = pifFiles
        .toSorted()
        .map(pifFile =>
          createChainTrackConfig({
            pifFile,
            sourceAssembly: config.assemblies[0]?.name ?? assemblyName,
            sourceName: assemblyName,
            ucscOrganism,
            baseUri,
          }),
        )
        .filter(
          (t): t is UcscTrack => t !== undefined && !existing.has(t.trackId),
        )
      if (added.length > 0) {
        config.tracks.push(...added)
        counts.added = added.length
      }
      return counts
    },
  }
}
