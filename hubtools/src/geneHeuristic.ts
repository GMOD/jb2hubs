// GenArk's tandemDups and gapOverlap pair two copies of a sequence as one
// BED12's blocks without saying so in trackDb.
const UNMARKED_NON_EXON_TRACKS = ['tandemDups', 'gapOverlap']

const BED_ADAPTERS = new Set(['BigBedAdapter', 'BedTabixAdapter'])

/**
 * Whether a BED12's blocks are something other than exons, so JBrowse should
 * not promote its features to transcripts. trackDb says so with `exonNumbers
 * off`, which stops UCSC numbering the blocks as exons: UniProt's protein
 * features, DGV's variants, nestedRepeats. `exonNumbers` is the track's own
 * setting or the one it inherits.
 */
export function blocksAreNotExons(
  trackName: string,
  exonNumbers: string | undefined,
) {
  return (
    exonNumbers?.toLowerCase() === 'off' ||
    UNMARKED_NON_EXON_TRACKS.some(suffix => trackName.endsWith(suffix))
  )
}

export function withBlocksAsNotExons<T extends Record<string, unknown>>(
  adapter: T,
  trackName: string,
  exonNumbers: string | undefined,
): T {
  return typeof adapter.type === 'string' &&
    BED_ADAPTERS.has(adapter.type) &&
    blocksAreNotExons(trackName, exonNumbers)
    ? { ...adapter, disableGeneHeuristic: true }
    : adapter
}
