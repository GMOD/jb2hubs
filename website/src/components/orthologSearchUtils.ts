import {
  genarkConfigPath,
  jbrowseUrl,
  onGeneTrackHost,
  ucscConfigPath,
} from '../config/jbrowse.ts'
import { flipLoc, panelTracks, syntenyViewUrl } from './jbrowseLinks.ts'
import { resolveStackNames, syntenyLink } from './syntenyPairIndex.ts'

import type { AssemblyStore } from './orthologDb.ts'
import type { PairIndex, SyntenyLink } from './syntenyPairIndex.ts'

// The species identity of one ortholog row: which hosted assembly it opens on,
// and what NCBI filed the ortholog under. The names come from the report rather
// than from the assembly index, which no longer carries any — NCBI names the
// taxon, not the assembly, so there is no "(Hereford L1 Dominette … 2018 USDA)"
// to strip off. `commonName` is the one field NCBI leaves out sometimes (~15% of
// rows), and the table renders the scientific name alone for those.
export interface Assembly {
  accession: string
  scientificName: string
  commonName?: string
  taxonId: number
  // UCSC browser db (hg38, mm39, …) when this assembly is a native UCSC genome
  // rather than a GenArk hub; drives which JBrowse config a launch URL targets.
  ucscDb?: string
}

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
  // S288C, the reference strain — NOT the species taxon 4932, which NCBI files
  // no gene records under: every symbol lookup against it comes back empty, and
  // the ortholog and genome reports name 559292 too.
  { label: 'Yeast (S. cerevisiae)', taxId: 559292 },
  { label: 'Arabidopsis', taxId: 3702 },
]

export const COMMON_TAX_RANK = new Map(
  COMMON_SPECIES.map((s, i) => [s.taxId, i]),
)

// A curated gene chip: the symbol, and why someone might want to look at it.
export interface Example {
  symbol: string
  note: string
}

// Display text for a reference-species field whose value may be a taxon id (as
// carried in ?ref=) or free text; known model organisms show as their label.
export function refLabel(ref: string) {
  return COMMON_SPECIES.find(s => String(s.taxId) === ref)?.label ?? ref
}

// The ?gene=&ref= link shape the gene-first pages (/gene, /protein-browser)
// all read back on mount.
export function geneUrl(path: string, symbol: string, taxId: number) {
  return `${path}?gene=${encodeURIComponent(symbol)}&ref=${taxId}`
}

// The same shape written onto the current page, so what is on screen stays
// shareable and bookmarkable. Takes the resolved taxon id rather than whatever
// was typed, so the link still means the same thing later.
export function syncGeneUrl(symbol: string, taxId: number) {
  window.history.replaceState(null, '', geneUrl('', symbol, taxId))
}

// NCBI Datasets API response shapes
interface NcbiGene {
  gene_id: string
  symbol: string
  tax_id?: string | number
  taxname?: string
  common_name?: string
  annotations?: {
    assembly_accession: string
    genomic_locations?: {
      genomic_accession_version: string
      sequence_name: string
      genomic_range?: { begin: string; end: string; orientation?: string }
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
  // Which strand of its own assembly the ortholog sits on, from NCBI's
  // `genomic_range.orientation`. Decides which panels a multi-species launch
  // opens flipped — see `strandFlips`. Defaults to 1 where NCBI names no
  // orientation, which in practice it always does: 565 of 565 placed BRCA1
  // ortholog locations carried one, measured 2026-08-28.
  strand: 1 | -1
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
  const config = ucscDb ? ucscConfigPath(ucscDb) : genarkConfigPath(accession)
  const assembly = ucscDb ?? accession
  // GenArk configs carry a defaultSession with no tracks, so a bare launch lands
  // on an empty browser — ask for the NCBI RefSeq GFF gene track by id (every
  // GCF GenArk hub has `<accession>-ncbiGff`). UCSC configs already open a gene
  // track in their generated defaultSession, whose id varies per db
  // (ncbiRefSeq/refGene/ensGene/…), so those are left alone.
  const tracks = ucscDb
    ? ''
    : `&tracks=${encodeURIComponent(`${accession}-ncbiGff`)}`
  const url = onGeneTrackHost(
    `${jbrowseUrl(config)}&assembly=${encodeURIComponent(assembly)}${tracks}`,
  )
  return loc ? `${url}&loc=${encodeURIComponent(loc)}` : url
}

// Whether a row's coordinates actually belong to the genome its synteny panel
// would open.
//
// syntenyLink matches on the version-stripped accession, deliberately, so a
// lookup succeeds whichever version the caller holds. That is right for FINDING
// a track and wrong for placing a locus: the panel opens under the name the
// catalog uses, and NCBI reports the ortholog against whatever version it
// annotated. Measured on TP53 against human 2026-08-27, 5 of the 38 rows with a
// link disagree — bonobo (row GCF_029289425.2, catalog .1), both orangutans, the
// siamang and the goat — and four of those are among the closest apes, so this
// is the common case for exactly the species a reader reaches for first. The
// panel then fails to navigate at all: NC_073268.2 is not a refName the .1
// assembly's chromAlias knows, so the row lands at position 0 of its first
// chromosome with no tracks loaded.
//
// A UCSC db name is a different naming scheme rather than a different assembly,
// so `hg38` is safe for the row the ortholog index maps to hg38 — and only for
// that row.
export function isSameGenome(
  panelName: string,
  hosted: { accession: string; ucscDb?: string },
) {
  return panelName === hosted.accession || panelName === hosted.ucscDb
}

// The synteny link for a row, kept only when the panel it names is the genome
// the row's coordinates came from. Every caller that goes on to navigate the
// panel wants this rather than syntenyLink.
export function orthologSyntenyLink(
  index: PairIndex,
  r: OrthologResult,
  otherAccession: string,
) {
  const link = syntenyLink(index, r.assembly.accession, otherAccession)
  return link && isSameGenome(link.names[0], r.assembly) ? link : undefined
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

// Which rows of a synteny launch open horizontally flipped, so the ortholog
// points the same way in every panel. Both launches on this page — the pairwise
// one below and the multi-species stack — go through this.
//
// Which strand an ortholog is annotated on is as much a fact about how its
// assembly happened to orient the scaffold as about the gene: BRCA1 is minus on
// hg38 chr17 and plus on the chimp and gorilla chromosomes it aligns to. Left
// alone, the human row draws its neighborhood back-to-front and the alignment
// ribbons above and below it cross the whole strip diagonally instead of running
// down it — the picture reads as a rearrangement where there is none.
//
// The top row is the frame everything else is matched to, rather than the
// reference row: the multi-species chain grows outward from the reference at
// both ends, so the reference usually sits in the MIDDLE of the stack, and
// anchoring there would flip the rows around it instead of the one row that
// disagrees. Either choice makes the ribbons parallel — they differ only in which
// way the whole figure reads — so the one that flips fewer rows, and leaves the
// row a reader's eye starts from in its own coordinates, wins.
//
// This is a per-gene decision and deliberately not a claim about the locus. A
// gene's own strand is the only orientation signal an ortholog row carries (the
// conserved-gene-order page, which knows the neighbours too, prefers the sign of
// their order correlation and falls back to this) — and for the thing being
// compared here, one gene seen in several genomes, it is exactly the right one.
export function strandFlips(rows: OrthologResult[]) {
  const anchor = rows[0]?.strand ?? 1
  return rows.map(r => r.strand !== anchor)
}

// Pairwise reference-vs-ortholog synteny launch. Both panels land on the
// neighborhood window around their gene and open that genome's gene track, so
// the ortholog is drawn rather than merely centered; the reference panel is left
// unnavigated only when the reference ortholog row is unknown, and flipped when
// its ortholog runs the other way from this row's. The panel assemblies come
// from the link, not from the accessions, because the track lives in a config
// that may know a genome as `hg38` rather than as GCF_000001405.40 — naming the
// accession there merges a hub without the track in it.
export function orthoSyntenyUrl(
  r: OrthologResult,
  link: SyntenyLink,
  ref: OrthologResult | undefined,
  flankBp = SYNTENY_FLANK_BP,
) {
  // The reference panel is the one that flips, since this row leads the stack.
  // An unnavigated reference panel has nothing to match, and no locstring to
  // carry the suffix.
  const flips = strandFlips(ref ? [r, ref] : [r])
  return onGeneTrackHost(
    syntenyViewUrl(
      [
        {
          assembly: link.names[0],
          loc: windowedLoc(r, flankBp),
          ...panelTracks(link.geneTracks[0]),
        },
        {
          assembly: link.names[1],
          ...(ref
            ? { loc: flipLoc(windowedLoc(ref, flankBp), flips[1] ?? false) }
            : {}),
          ...panelTracks(link.geneTracks[1]),
        },
      ],
      [link.trackId],
    ),
  )
}

export interface MultiSyntenyPlan {
  // top-to-bottom row order
  rows: OrthologResult[]
  // names[i] is the assembly name rows[i]'s panel opens under — see
  // orthoSyntenyUrl on why that is not always the accession
  names: string[]
  // geneTracks[i] is the gene track rows[i]'s panel opens, '' where the catalog
  // knows none
  geneTracks: string[]
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
  index: PairIndex,
): MultiSyntenyPlan | null {
  const ref = results.find(r => r.assembly.accession === refAccession)
  if (!ref) {
    return null
  }
  // A row's index is its preference rank when several candidates could extend
  // the chain — the caller's order, not a phylogeny this function computes.
  // syntenyCandidates (multiSyntenyPicker.ts) passes shared-lineage order, which
  // is what makes the suggestion reach for chimp before chicken; a caller that
  // passes the raw result set gets COMMON_TAX_RANK, then alphabetical.
  //
  // Greedy, and deliberately not a longest-path search. A DFS over TP53's
  // catalog finds a 12-genome chain (Leopardus -> Felis -> Capra -> Ovis ->
  // Oryctolagus -> human -> rat -> mouse -> chicken -> Bos -> Bubalus x2), and
  // an answer of that shape is exactly what made the old launch look arbitrary.
  // Longer is not better here; the reader picks.
  const rank = new Map(results.map((r, i) => [r.assembly.accession, i]))
  const used = new Set([refAccession])
  const chain = [ref]
  // The assembly name each chained row's panel opens under, fixed by the link
  // that placed it. A genome our catalog knows under two names (UCSC dm6 and
  // the GenArk accession both appear) can only be one panel, so an extension
  // whose link disagrees with the name already assigned is not a valid step —
  // taking it would name a panel the neighbouring track cannot bind to.
  const names = new Map<string, string>()

  function bestNeighbor(node: OrthologResult) {
    const nodeAcc = node.assembly.accession
    let best: { result: OrthologResult; link: SyntenyLink } | undefined
    let bestRank = Infinity
    for (const r of results) {
      const acc = r.assembly.accession
      const link = used.has(acc) ? undefined : syntenyLink(index, nodeAcc, acc)
      const settled = names.get(nodeAcc)
      const rk = rank.get(acc) ?? Infinity
      if (link && rk < bestRank && (!settled || settled === link.names[0])) {
        best = { result: r, link }
        bestRank = rk
      }
    }
    return best
  }

  function extend(end: 'head' | 'tail') {
    const node = end === 'tail' ? chain.at(-1) : chain.at(0)
    const next = node && bestNeighbor(node)
    if (next) {
      names.set(node.assembly.accession, next.link.names[0])
      names.set(next.result.assembly.accession, next.link.names[1])
      used.add(next.result.assembly.accession)
      if (end === 'tail') {
        chain.push(next.result)
      } else {
        chain.unshift(next.result)
      }
    }
    return !!next
  }

  while (extend('tail') || extend('head')) {
    // grow the tail as far as it goes, then the head
  }

  if (chain.length < 2) {
    return null
  }
  // Every adjacency was added through a link whose name agreed, so the resolver
  // reproduces those names and drops nothing; going through it rather than
  // reading `names` keeps one copy of the panel-naming rule.
  const stack = resolveStackNames(
    chain.map(r => r.assembly.accession),
    index,
  )
  return {
    rows: chain,
    names: stack.names,
    geneTracks: stack.geneTracks,
    tracks: stack.tracks.flat(),
  }
}

// Multi-row LinearSyntenyView launch URL for a chain plan. Each adjacent row
// pair becomes a level carrying its single synteny track; every panel lands on
// its ortholog's neighborhood window with that genome's gene track open, which
// is what makes the launch show the gene in every genome rather than a stack of
// empty browsers at the right coordinates — flipped, for a row whose ortholog
// runs the other way.
export function buildMultiSyntenyUrl(
  plan: MultiSyntenyPlan,
  flankBp = SYNTENY_FLANK_BP,
) {
  const flips = strandFlips(plan.rows)
  return onGeneTrackHost(
    syntenyViewUrl(
      plan.rows.map((r, i) => ({
        assembly: plan.names[i] ?? r.assembly.accession,
        loc: flipLoc(windowedLoc(r, flankBp), flips[i] ?? false),
        ...panelTracks(plan.geneTracks[i] ?? ''),
      })),
      plan.tracks.map(t => [t]),
    ),
  )
}

export function formatNumber(n: number) {
  return n.toLocaleString('en-US')
}

// The rows as a spreadsheet, which is where a set of ortholog coordinates
// usually ends up. Tab-separated rather than comma, because a species common
// name may well carry a comma and no field here can contain a tab, so this
// needs no quoting rules. Takes whatever
// the caller has on screen, so the filter and the clade scope carry through.
export function orthologsToTsv(results: OrthologResult[]) {
  const header = [
    'scientific_name',
    'common_name',
    'taxon_id',
    'gene_symbol',
    'gene_id',
    'assembly',
    'refname',
    'chromosome',
    'begin',
    'end',
    'jbrowse_url',
  ]
  const rows = results.map(r =>
    [
      r.assembly.scientificName,
      r.assembly.commonName ?? '',
      r.assembly.taxonId,
      r.geneSymbol,
      r.geneId,
      r.assembly.accession,
      r.locStr.split(':')[0] ?? r.chromosome,
      r.chromosome,
      r.begin,
      r.end,
      r.jbrowseUrl,
    ].join('\t'),
  )
  return [header.join('\t'), ...rows].join('\n')
}

// Free-text row filter over the four things a reader would actually type at a
// table of several hundred species: either species name, the ortholog's own
// symbol (which often differs from the query's — an uncharacterised locus reads
// LOC…), and the assembly accession. Whitespace-separated terms are ANDed, so
// "mus brca" narrows rather than widening.
export function matchesQuery(r: OrthologResult, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) {
    return true
  }
  const haystack = [
    r.assembly.scientificName,
    r.assembly.commonName ?? '',
    r.geneSymbol,
    r.assembly.accession,
  ]
    .join(' ')
    .toLowerCase()
  return terms.every(t => haystack.includes(t))
}

export function buildOrthologResults(
  reports: NcbiOrthologReport[],
  store: AssemblyStore,
): OrthologResult[] {
  const results: OrthologResult[] = []

  for (const { gene } of reports) {
    // A row is grouped by clade, ranked against COMMON_TAX_RANK and matched
    // against the reference by taxon, so a report without one has no place to
    // go. Every report carries `tax_id` (658 of 658 on TP53, measured
    // 2026-08-27); the guard is the same one buildRows applies in
    // orthologSet.ts, not a case seen in the wild.
    const taxonId = Number(gene.tax_id)
    if (!Number.isFinite(taxonId)) {
      continue
    }
    // First hosted annotation carrying any placed location. Scans every location
    // (not just [0]) so an annotation whose first location lacks a range still
    // resolves off a later placed one, matching locate() in orthologSet.ts.
    for (const ann of gene.annotations ?? []) {
      const hosted = store.find(ann.assembly_accession)
      const loc = ann.genomic_locations?.find(l => l.genomic_range)
      if (hosted && loc?.genomic_range) {
        const assembly: Assembly = {
          accession: hosted.accession,
          ucscDb: hosted.ucscDb,
          scientificName: gene.taxname ?? String(taxonId),
          commonName: gene.common_name,
          taxonId,
        }
        const begin = parseInt(loc.genomic_range.begin)
        const end = parseInt(loc.genomic_range.end)
        const strand = loc.genomic_range.orientation === 'minus' ? -1 : 1
        const locStr = `${loc.genomic_accession_version}:${begin}-${end}`
        results.push({
          assembly,
          geneSymbol: gene.symbol,
          geneId: gene.gene_id,
          chromosome: loc.sequence_name,
          begin,
          end,
          locStr,
          strand,
          jbrowseUrl: accessionToJbrowseUrl(
            assembly.accession,
            locStr,
            assembly.ucscDb,
          ),
        })
        break
      }
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
