import { isAccession, normalizeAssemblyName } from 'hubtools'

import type { ChainTrack, Track } from 'hubtools'

// `<source>To<target>.pif.gz` or `<source>.<target>.pif.gz`
export function parseTargetAssembly(pifBaseName: string) {
  const match =
    /^(.+?)To(.+?)$/.exec(pifBaseName) ?? /^(.+?)\.(.+?)$/.exec(pifBaseName)
  return match?.[2]
}

export function buildChainTracks({
  sourceAccession,
  sourceCommonName,
  pifFiles,
  targetCommonName,
}: {
  sourceAccession: string
  sourceCommonName: string
  pifFiles: string[]
  // '' when the target has no known display name
  targetCommonName: (target: string, isGenArk: boolean) => string
}) {
  const tracks: (ChainTrack & Track)[] = []
  for (const pifFile of pifFiles) {
    const targetOrig = parseTargetAssembly(pifFile.replace('.pif.gz', ''))
    if (targetOrig) {
      const target = normalizeAssemblyName(targetOrig)
      const targetCommon = targetCommonName(target, isAccession(targetOrig))
      tracks.push({
        type: 'SyntenyTrack',
        trackId: `${sourceAccession}_to_${target}_liftOver`,
        name: targetCommon
          ? `${sourceAccession} (${sourceCommonName}) to ${targetCommon} liftOver`
          : `${sourceAccession} to ${target} liftOver`,
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
  }
  return tracks
}
