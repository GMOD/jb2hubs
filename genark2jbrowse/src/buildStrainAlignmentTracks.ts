//
// The two track configs `createEnsemblMouseChainTracks.ts` adds to a mouse
// strain's GenArk config for its alignment against mm39, as their own module so
// they can be tested — that script runs its whole body at import (it walks the
// hub directories and rewrites configs on disk), so nothing defined inside it is
// reachable from a test. Same split, for the same reason, as
// `ucsc2jbrowse/src/buildBigMafTrack.ts`.
//
// Both describe the *same* alignment in two forms: the PIF drives a synteny
// view between two assemblies, the bigMaf drives a MafTrack on one. That
// difference is the whole reason they do not share an `assemblyNames`.
//

/** `liftOver/` is beside the config that names it, so the uris stay relative. */
function liftOverUri(file: string) {
  return { uri: `liftOver/${file}` }
}

/**
 * The pairwise alignment as a synteny track, which genuinely spans two
 * assemblies: `<strain>Tomm39` is in the strain's coordinates as the target,
 * with mm39 as the query.
 */
export function buildStrainSyntenyTrack({
  acc,
  strainName,
  pifFile,
}: {
  acc: string
  strainName: string
  pifFile: string
}) {
  return {
    type: 'SyntenyTrack',
    trackId: `${acc}_to_mm39_synteny`,
    name: `${strainName} to mm39 alignments`,
    category: ['Pairwise alignments'],
    assemblyNames: [acc, 'mm39'],
    adapter: {
      type: 'PairwiseIndexedPAFAdapter',
      targetAssembly: acc,
      queryAssembly: 'mm39',
      pifGzLocation: liftOverUri(pifFile),
      index: {
        location: liftOverUri(`${pifFile}.csi`),
        indexType: 'CSI',
      },
    },
  }
}

/**
 * The same alignment as a MafTrack: rows for the two genomes, drawn on the
 * strain's own coordinates.
 *
 * Two things here were wrong in a way nothing in this repo could catch, since
 * an unknown config slot is silently ignored rather than rejected, and the only
 * config checker we have boots the configs on disk — which never contained this
 * track, because the script only writes it when the `.bb` is present locally.
 *
 * - The file slot was `bigMafLocation`, which `BigMafAdapter` does not declare.
 *   Its slot is `bigBedLocation`, and unset it falls back to the schema default
 *   `/path/to/my.bb` — so the track was guaranteed to fetch a path that has
 *   never existed.
 * - `assemblyNames` listed both genomes, copied from the synteny track above.
 *   A MafTrack has one reference and the rest are rows, and this bigBed is in
 *   the target's (the strain's) coordinates, so naming mm39 too offered the
 *   track on mm39 views where its coordinates do not apply.
 *
 * No `summaryAdapter` and no `annotationAdapter`, deliberately, and this is the
 * one MAF track in the repo for which that is right rather than an omission.
 * Both are UCSC sidecars built beside a multiz — `bigMafSummary.bb` and
 * `mafFrames.bb` — and this alignment is neither: it is a pairwise chain
 * converted out of band, so there is no summary file, and mafFrames comes from
 * projecting a gene annotation onto a multiple alignment, which nothing here
 * does. The two UCSC hub paths (`ucsc2jbrowse/src/buildBigMafTrack.ts` and
 * `hubtools/src/createTrackConfiguration.ts`) wire both whenever the trackDb
 * stanza names them.
 *
 * No `samples` either, so the display discovers its rows from the source tokens
 * in the file. That is the safe default rather than a missing feature: a
 * configured id has to match a source token exactly, and a set that matches
 * nothing does not degrade to discovery — every row is dropped and the track
 * draws its configured species as labelled rows with no bases under them. The
 * db names this chain's converter wrote are not knowable from here.
 */
export function buildStrainMafTrack({
  acc,
  strainName,
  bigMafFile,
}: {
  acc: string
  strainName: string
  bigMafFile: string
}) {
  return {
    type: 'MafTrack',
    trackId: `${acc}_to_mm39_maf`,
    name: `${strainName} vs mm39 (MAF)`,
    category: ['Pairwise alignments'],
    assemblyNames: [acc],
    adapter: {
      type: 'BigMafAdapter',
      bigBedLocation: liftOverUri(bigMafFile),
    },
  }
}
