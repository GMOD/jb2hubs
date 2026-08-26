// Tolerant lookup over the precomputed pairwise-synteny catalog
// (synteny_pairs.json). A key's two halves are versioned RefSeq accessions,
// sometimes carrying an assembly-name suffix (e.g. GCF_000001735.4_TAIR10.1).
// Matching on the version-and-suffix-stripped base makes lookups robust to
// whichever version a caller happens to hold, and is order-insensitive. Shared
// by every synteny drill-down (the ortholog table and the gene-order
// neighborhood view) so the matching rule lives once.
//
// An entry carries the assembly names the track's own hosted config uses
// alongside the trackId, because for 11 of our assemblies those are NOT the
// accession: a human comparison is `hg38`, and the track lives in
// /ucsc/hg38/config.json. A launch built from the accession would merge a hub
// that does not contain the track. So a lookup answers with names, not just an
// id, and the caller uses them for both the merged hubs and the panel assembly
// names.

// One catalog entry as generateSyntenyPairIndex.ts writes it:
// [trackId, name of the key's first half, name of its second half].
export type PairEntry = [string, string, string]

export interface SyntenyLink {
  trackId: string
  // Assembly names oriented to the caller's argument order: names[0] belongs to
  // the first accession asked about, names[1] to the second.
  names: [string, string]
}

export type PairIndex = Map<string, SyntenyLink>

// GCF_000001405.40 or GCF_000001735.4_TAIR10.1 -> GCF_000001405 / GCF_000001735,
// so accessions match regardless of version or assembly-name suffix.
export function accessionBase(accession: string) {
  const [prefix, id] = accession.split('_')
  return prefix && id ? `${prefix}_${id.replace(/\.\d+$/, '')}` : accession
}

export function buildPairIndex(pairs: Record<string, PairEntry>): PairIndex {
  const index: PairIndex = new Map()
  for (const [key, [trackId, nameA, nameB]] of Object.entries(pairs)) {
    const [a, b] = key.split(',')
    if (a && b) {
      index.set(`${accessionBase(a)}|${accessionBase(b)}`, {
        trackId,
        names: [nameA, nameB],
      })
    }
  }
  return index
}

// Panel assembly names + per-level tracks for an ordered stack of genomes, the
// shape a LinearSyntenyView launch needs. A level's track is kept only when both
// of its ends agree with the names already fixed by earlier levels: a genome our
// catalog holds under two names (UCSC `dm6` and the GenArk accession both
// appear) can open as only one panel, and naming the other would leave the
// neighbouring track with nothing to bind to. A dropped level keeps its empty
// slot, since JBrowse binds tracks to levels by array position.
export function resolveStackNames(accessions: string[], index: PairIndex) {
  const names = accessions.slice()
  // Which panels a kept link has already named. Comparing against names[i - 1]
  // alone would not do: a genome whose own level was dropped still holds its
  // accession there, and that reads as a conflict with the next link even
  // though nothing has claimed the panel yet.
  const settled = new Set<number>()
  const tracks: string[][] = []
  for (let i = 1; i < accessions.length; i++) {
    const a = accessions[i - 1]
    const b = accessions[i]
    const link = a && b ? syntenyLink(index, a, b) : undefined
    // Only the left end can conflict: the right end is claimed for the first
    // time by whichever level reaches it first.
    if (link && (!settled.has(i - 1) || names[i - 1] === link.names[0])) {
      names[i - 1] = link.names[0]
      names[i] = link.names[1]
      settled.add(i - 1).add(i)
      tracks.push([link.trackId])
    } else {
      tracks.push([])
    }
  }
  return { names, tracks }
}

export function syntenyLink(index: PairIndex, a: string, b: string) {
  const forward = index.get(`${accessionBase(a)}|${accessionBase(b)}`)
  if (forward) {
    return forward
  }
  const reverse = index.get(`${accessionBase(b)}|${accessionBase(a)}`)
  return reverse
    ? {
        trackId: reverse.trackId,
        names: [reverse.names[1], reverse.names[0]] as [string, string],
      }
    : undefined
}
