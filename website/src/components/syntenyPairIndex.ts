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

// 4 for GCF_000001735.4_TAIR10.1, and 0 for an accession that carries none.
function accessionVersion(accession: string) {
  const id = accession.split('_')[1] ?? ''
  return Number(/\.(\d+)$/.exec(id)?.[1] ?? 0)
}

// Two keys that differ only in version, a GenArk hub's .1 and .2 against hg38,
// are one lookup here, and the newer versions win it: those are what the
// ortholog store resolves a base to, and so the names a panel can open under.
// generateSyntenyPairIndex.ts keeps the same one, so a collision reaches this
// only from a catalog written before it did.
export function buildPairIndex(pairs: Record<string, PairEntry>): PairIndex {
  const index: PairIndex = new Map()
  const versions = new Map<string, number>()
  let stale = 0
  for (const [key, entry] of Object.entries(pairs)) {
    const [a, b] = key.split(',')
    // Entries were bare trackId strings until the names were added, and
    // destructuring one yields its first three characters: skipping is the
    // difference between no synteny links and a track called "G".
    if (!Array.isArray(entry)) {
      stale += 1
    } else if (a && b) {
      const id = `${accessionBase(a)}|${accessionBase(b)}`
      const version = accessionVersion(a) + accessionVersion(b)
      if (version > (versions.get(id) ?? -1)) {
        const [trackId, nameA, nameB, geneA, geneB] = entry
        versions.set(id, version)
        index.set(id, {
          trackId,
          names: [nameA, nameB],
          geneTracks: [geneA ?? '', geneB ?? ''],
        })
      }
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
// launch needs. A level keeps its track only when both of its panels can open
// under the names its link gives them. `opensAs(i, name)` says whether panel i's
// locus is in the genome `name` stands for: the catalog matches across assembly
// versions, and a panel opened under another version cannot navigate to the
// locus it was given. A name an earlier level fixed has to agree too, since a
// genome the catalog holds under two names (UCSC `dm6` and its GenArk accession)
// is still one panel.
//
// A dropped level keeps its empty slot, because JBrowse binds tracks to levels
// by array position, and a panel no kept level names comes back undefined for
// the caller to name.
export function resolveStackNames(
  accessions: string[],
  index: PairIndex,
  opensAs: (panel: number, name: string) => boolean,
) {
  const names: (string | undefined)[] = accessions.map(() => undefined)
  const geneTracks = accessions.map(() => '')
  const tracks: string[][] = []
  for (let i = 1; i < accessions.length; i++) {
    const a = accessions[i - 1]
    const b = accessions[i]
    const link = a && b ? syntenyLink(index, a, b) : undefined
    const left = names[i - 1]
    if (
      link &&
      (left === undefined || left === link.names[0]) &&
      opensAs(i - 1, link.names[0]) &&
      opensAs(i, link.names[1])
    ) {
      names[i - 1] = link.names[0]
      names[i] = link.names[1]
      geneTracks[i - 1] = link.geneTracks[0]
      geneTracks[i] = link.geneTracks[1]
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
