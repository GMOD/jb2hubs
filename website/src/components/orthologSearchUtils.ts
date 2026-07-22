import { syntenyViewUrl } from './jbrowseLinks.ts'
import { buildPairIndex, trackFor } from './syntenyPairIndex.ts'

import type { Assembly, AssemblyStore } from './orthologDb.ts'

export type { Assembly, AssemblyIndex, AssemblyStore } from './orthologDb.ts'
export { assemblyLabel, createStore } from './orthologDb.ts'

export const COMMON_SPECIES = [
  { label: 'Human', taxId: 9606 },
  { label: 'Mouse', taxId: 10090 },
  { label: 'Rat', taxId: 10116 },
  { label: 'Zebrafish', taxId: 7955 },
  { label: 'Chicken', taxId: 9031 },
  { label: 'Dog', taxId: 9615 },
  { label: 'Cow', taxId: 9913 },
  { label: 'Pig', taxId: 9823 },
  { label: 'Frog (X. tropicalis)', taxId: 8364 },
  { label: 'Fruitfly', taxId: 7227 },
  { label: 'C. elegans', taxId: 6239 },
  { label: 'Yeast (S. cerevisiae)', taxId: 4932 },
  { label: 'Arabidopsis', taxId: 3702 },
]

export const COMMON_TAX_RANK = new Map(
  COMMON_SPECIES.map((s, i) => [s.taxId, i]),
)

// Display text for a reference-species field whose value may be a taxon id (as
// carried in ?ref=) or free text; known model organisms show as their label.
export function refLabel(ref: string) {
  return COMMON_SPECIES.find(s => String(s.taxId) === ref)?.label ?? ref
}

// NCBI Datasets API response shapes
interface NcbiGene {
  gene_id: string
  symbol: string
  annotations?: {
    assembly_accession: string
    genomic_locations?: {
      genomic_accession_version: string
      sequence_name: string
      genomic_range?: { begin: string; end: string }
    }[]
  }[]
}

export interface NcbiOrthologReport {
  gene: NcbiGene
}

export interface NcbiOrthologResponse {
  reports?: NcbiOrthologReport[]
  total_count?: number
}

export interface OrthologResult {
  assembly: Assembly
  geneSymbol: string
  geneId: string
  chromosome: string
  begin: number
  end: number
  locStr: string
  jbrowseUrl: string
}

// Single-genome JBrowse launch URL. UCSC-native assemblies (ucscDb set, e.g.
// human/hg38) resolve to the curated /ucsc/<db> config — their GenArk-sharded
// config exists but its sequence data 404s, so the GenArk path would open a
// browser with no sequence. Everything else uses the GenArk hub path, whose base
// is the accession sharded three digits at a time. NCBI's RefSeq refName in loc
// (e.g. NC_000017.11) resolves against both configs via their chromAlias.
export function accessionToJbrowseUrl(
  accession: string,
  loc?: string,
  ucscDb?: string,
) {
  const [base = '', rest = ''] = accession.split('_')
  const digits = rest.replace(/\.\d+$/, '')
  const b1 = digits.slice(0, 3)
  const b2 = digits.slice(3, 6)
  const b3 = digits.slice(6, 9)
  const config = ucscDb
    ? `/ucsc/${ucscDb}/config.json`
    : `/hubs/genark/${base}/${b1}/${b2}/${b3}/${accession}/config.json`
  const assembly = ucscDb ?? accession
  // GenArk configs carry a defaultSession with no tracks, so a bare launch lands
  // on an empty browser — ask for the NCBI RefSeq GFF gene track by id (every
  // GCF GenArk hub has `<accession>-ncbiGff`). UCSC configs already open a gene
  // track in their generated defaultSession, whose id varies per db
  // (ncbiRefSeq/refGene/ensGene/…), so those are left alone.
  const tracks = ucscDb
    ? ''
    : `&tracks=${encodeURIComponent(`${accession}-ncbiGff`)}`
  const url = `https://jbrowse.org/code/jb2/latest/?config=${config}&assembly=${encodeURIComponent(assembly)}${tracks}`
  return loc ? `${url}&loc=${encodeURIComponent(loc)}` : url
}

// bp of context drawn either side of the ortholog gene, so a launched synteny
// panel shows the neighborhood rather than landing flush on the gene bounds
// (at gene scale the alignment ribbons would otherwise be invisible).
export const SYNTENY_FLANK_BP = 100_000

// A refName:start-end locstring expanded by flankBp each side, clamped to 1
// (locstrings are 1-based) so a gene near a contig start stays parseable.
export function flankLoc(
  refName: string,
  start: number,
  end: number,
  flankBp: number,
) {
  return `${refName}:${Math.max(1, start - flankBp)}-${end + flankBp}`
}

// genomic_accession_version:start-end with flanking context. The accession comes
// off locStr (already `${accession}:${begin}-${end}`) rather than r.chromosome,
// which is the human-friendly sequence name and not a navigable refName.
function windowedLoc(r: OrthologResult, flankBp: number) {
  const refName = r.locStr.split(':')[0] ?? r.chromosome
  return flankLoc(refName, r.begin, r.end, flankBp)
}

// Pairwise reference-vs-ortholog synteny launch. Both panels land on the
// neighborhood window around their gene; the reference panel is left unnavigated
// only when the reference ortholog row is unknown.
export function orthoSyntenyUrl(
  refAccession: string,
  r: OrthologResult,
  trackId: string,
  ref: OrthologResult | undefined,
  flankBp = SYNTENY_FLANK_BP,
) {
  return syntenyViewUrl(
    [
      { assembly: r.assembly.accession, loc: windowedLoc(r, flankBp) },
      {
        assembly: refAccession,
        ...(ref ? { loc: windowedLoc(ref, flankBp) } : {}),
      },
    ],
    [trackId],
  )
}

export interface MultiSyntenyPlan {
  // top-to-bottom row order
  rows: OrthologResult[]
  // tracks[i] is the synteny track linking rows[i] and rows[i + 1]
  tracks: string[]
}

// Order the ortholog rows into the longest chain we can build where every
// *adjacent* pair has a synteny track in the catalog. A LinearSyntenyView is a
// linear stack: level i only draws ribbons between rows i and i+1, so row
// adjacency — not taxonomy — is what makes a ribbon appear. We grow a chain
// outward from the reference at both ends, each step taking the closest-ranked
// unused species that has a track to the current end of the chain. The result
// degrades gracefully with catalog connectivity: a star-shaped catalog (every
// ortholog links only to the reference) puts the reference in the middle and
// can flank it with at most its two nearest partners (a 3-row chain) — the rest
// can't be placed without repeating the reference; richer, path-shaped catalogs
// yield longer multi-species stacks. Returns null when nothing chains to ref.
export function planMultiSynteny(
  results: OrthologResult[],
  refAccession: string,
  syntenyPairs: Record<string, string>,
): MultiSyntenyPlan | null {
  const ref = results.find(r => r.assembly.accession === refAccession)
  // results arrive pre-sorted by evolutionary proximity to the reference, so a
  // row's index doubles as a "closeness" rank for tie-breaking chain extension.
  const rank = new Map(results.map((r, i) => [r.assembly.accession, i]))
  const index = buildPairIndex(syntenyPairs)

  let plan: MultiSyntenyPlan | null = null
  if (ref) {
    const used = new Set([refAccession])
    const chain = [ref]

    function bestNeighbor(node: string) {
      let best: { result: OrthologResult; track: string } | undefined
      let bestRank = Infinity
      for (const r of results) {
        const acc = r.assembly.accession
        const track = used.has(acc) ? undefined : trackFor(index, node, acc)
        const rk = rank.get(acc) ?? Infinity
        if (track && rk < bestRank) {
          best = { result: r, track }
          bestRank = rk
        }
      }
      return best
    }

    let extended = true
    while (extended) {
      extended = false
      const tail = chain.at(-1)
      const next = tail && bestNeighbor(tail.assembly.accession)
      if (next) {
        chain.push(next.result)
        used.add(next.result.assembly.accession)
        extended = true
      } else {
        const head = chain.at(0)
        const prev = head && bestNeighbor(head.assembly.accession)
        if (prev) {
          chain.unshift(prev.result)
          used.add(prev.result.assembly.accession)
          extended = true
        }
      }
    }

    if (chain.length >= 2) {
      const tracks: string[] = []
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1]
        const b = chain[i]
        // every adjacency was added through an edge, so this is always defined
        const track =
          a && b && trackFor(index, a.assembly.accession, b.assembly.accession)
        if (track) {
          tracks.push(track)
        }
      }
      plan = { rows: chain, tracks }
    }
  }
  return plan
}

// Multi-row LinearSyntenyView launch URL for a chain plan. Each adjacent row
// pair becomes a level carrying its single synteny track; every panel lands on
// its ortholog's neighborhood window.
export function buildMultiSyntenyUrl(
  plan: MultiSyntenyPlan,
  flankBp = SYNTENY_FLANK_BP,
) {
  return syntenyViewUrl(
    plan.rows.map(r => ({
      assembly: r.assembly.accession,
      loc: windowedLoc(r, flankBp),
    })),
    plan.tracks.map(t => [t]),
  )
}

export function formatNumber(n: number) {
  return n.toLocaleString('en-US')
}

export function buildOrthologResults(
  reports: NcbiOrthologReport[],
  store: AssemblyStore,
): OrthologResult[] {
  const results: OrthologResult[] = []

  for (const { gene } of reports) {
    // First hosted annotation carrying any placed location. Scans every location
    // (not just [0]) so an annotation whose first location lacks a range still
    // resolves off a later placed one, matching locate() in orthologSet.ts.
    const hit = (gene.annotations ?? [])
      .map(ann => ({
        assembly: store.find(ann.assembly_accession),
        loc: ann.genomic_locations?.find(l => l.genomic_range),
      }))
      .find(({ assembly, loc }) => assembly && loc?.genomic_range)
    const assembly = hit?.assembly
    const loc = hit?.loc
    if (assembly && loc?.genomic_range) {
      const begin = parseInt(loc.genomic_range.begin)
      const end = parseInt(loc.genomic_range.end)
      const locStr = `${loc.genomic_accession_version}:${begin}-${end}`
      results.push({
        assembly,
        geneSymbol: gene.symbol,
        geneId: gene.gene_id,
        chromosome: loc.sequence_name,
        begin,
        end,
        locStr,
        jbrowseUrl: accessionToJbrowseUrl(
          assembly.accession,
          locStr,
          assembly.ucscDb,
        ),
      })
    }
  }

  return results.sort((a, b) => {
    const ar = COMMON_TAX_RANK.get(a.assembly.taxonId) ?? Infinity
    const br = COMMON_TAX_RANK.get(b.assembly.taxonId) ?? Infinity
    return ar !== br
      ? ar - br
      : a.assembly.scientificName.localeCompare(b.assembly.scientificName)
  })
}
