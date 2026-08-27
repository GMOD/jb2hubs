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

// One catalog entry as generateSyntenyPairIndex.ts writes it: [trackId, name of
// the key's first half, name of its second half, and the gene track each of
// those two panels should open]. A gene track is '' when the generator could not
// resolve one. The last two are optional in the type because a dev tree can
// hold a `synteny_pairs.json` written before they existed: names and trackIds
// are still usable there, so those entries degrade to the old empty-panel launch
// rather than being dropped.
export type PairEntry = [string, string, string, string?, string?]

export interface SyntenyLink {
  trackId: string
  // Assembly names oriented to the caller's argument order: names[0] belongs to
  // the first accession asked about, names[1] to the second.
  names: [string, string]
  // The gene track each panel opens, in the same order as `names`, and '' for a
  // genome with none. A synteny sub-view carries no defaultSession, so a panel
  // launched without one is an empty browser at the right locus.
  geneTracks: [string, string]
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
  let stale = 0
  for (const [key, entry] of Object.entries(pairs)) {
    const [a, b] = key.split(',')
    // Entries were bare trackId strings until the names were added. A stale
    // public/synteny_pairs.json is a dev-tree condition, not a shipped one
    // (`pnpm generate` rewrites it every build) — but destructuring a string by
    // array pattern yields its first three characters, so skipping is the
    // difference between no synteny links and links naming a track called "G".
    if (!Array.isArray(entry)) {
      stale += 1
    } else if (a && b) {
      const [trackId, nameA, nameB, geneA, geneB] = entry
      index.set(`${accessionBase(a)}|${accessionBase(b)}`, {
        trackId,
        names: [nameA, nameB],
        // A pre-gene-tracks file still has usable names and trackIds, so it
        // degrades to the old empty-panel launch rather than being skipped.
        geneTracks: [geneA ?? '', geneB ?? ''],
      })
    }
  }
  if (stale > 0) {
    console.warn(
      `synteny_pairs.json has ${stale} entries in the pre-names format; run \`pnpm generate\` in website/`,
    )
  }
  return index
}

// Panel assembly names, the gene track each panel opens, and the per-level
// synteny tracks for an ordered stack of genomes — the shape a LinearSyntenyView
// launch needs. A level's track is kept only when both
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
  // Fixed by the same link that fixes the panel's name, so a panel can never be
  // handed a gene track from the config it did not open under.
  const geneTracks = accessions.map(() => '')
  for (let i = 1; i < accessions.length; i++) {
    const a = accessions[i - 1]
    const b = accessions[i]
    const link = a && b ? syntenyLink(index, a, b) : undefined
    // Only the left end can conflict: the right end is claimed for the first
    // time by whichever level reaches it first.
    if (link && (!settled.has(i - 1) || names[i - 1] === link.names[0])) {
      names[i - 1] = link.names[0]
      names[i] = link.names[1]
      geneTracks[i - 1] = link.geneTracks[0]
      geneTracks[i] = link.geneTracks[1]
      settled.add(i - 1).add(i)
      tracks.push([link.trackId])
    } else {
      tracks.push([])
    }
  }
  return { names, geneTracks, tracks }
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
        geneTracks: [reverse.geneTracks[1], reverse.geneTracks[0]] as [
          string,
          string,
        ],
      }
    : undefined
}
