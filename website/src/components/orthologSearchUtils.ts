import {
  JBROWSE_BASE,
  genarkConfigPath,
  ucscConfigPath,
} from '../config/jbrowse.ts'
import { syntenyViewUrl } from './jbrowseLinks.ts'
import { DEFAULT_SCOPE } from './orthologClades.ts'
import { resolveStackNames, syntenyLink } from './syntenyPairIndex.ts'

import type { Assembly, AssemblyStore } from './orthologDb.ts'
import type { PairIndex, SyntenyLink } from './syntenyPairIndex.ts'

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

// The ?gene=&ref= link shape the gene-first pages (/orthologs,
// /conserved-gene-order, /protein-browser) all read back on mount.
export function geneUrl(path: string, symbol: string, taxId: number) {
  return `${path}?gene=${encodeURIComponent(symbol)}&ref=${taxId}`
}

// The same shape written onto the current page, so what is on screen stays
// shareable and bookmarkable. Takes the resolved taxon id rather than whatever
// was typed, so the link still means the same thing later.
export function syncGeneUrl(symbol: string, taxId: number) {
  window.history.replaceState(null, '', geneUrl('', symbol, taxId))
}

// The ortholog page's own link, which additionally carries the clade the search
// was scoped to. The default scope is left out so the common link stays the
// same shape the other gene-first pages read.
export function orthologSearchUrl(
  symbol: string,
  taxId: number,
  scopeId: string,
) {
  const base = geneUrl('', symbol, taxId)
  return scopeId === DEFAULT_SCOPE.id ? base : `${base}&scope=${scopeId}`
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
  const url = `${JBROWSE_BASE}/?config=${config}&assembly=${encodeURIComponent(assembly)}${tracks}`
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
// only when the reference ortholog row is unknown. The panel assemblies come
// from the link, not from the accessions, because the track lives in a config
// that may know a genome as `hg38` rather than as GCF_000001405.40 — naming the
// accession there merges a hub without the track in it.
export function orthoSyntenyUrl(
  r: OrthologResult,
  link: SyntenyLink,
  ref: OrthologResult | undefined,
  flankBp = SYNTENY_FLANK_BP,
) {
  return syntenyViewUrl(
    [
      { assembly: link.names[0], loc: windowedLoc(r, flankBp) },
      {
        assembly: link.names[1],
        ...(ref ? { loc: windowedLoc(ref, flankBp) } : {}),
      },
    ],
    [link.trackId],
  )
}

export interface MultiSyntenyPlan {
  // top-to-bottom row order
  rows: OrthologResult[]
  // names[i] is the assembly name rows[i]'s panel opens under — see
  // orthoSyntenyUrl on why that is not always the accession
  names: string[]
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
  // results arrive pre-sorted by evolutionary proximity to the reference, so a
  // row's index doubles as a "closeness" rank for tie-breaking chain extension.
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
  return { rows: chain, names: stack.names, tracks: stack.tracks.flat() }
}

// Multi-row LinearSyntenyView launch URL for a chain plan. Each adjacent row
// pair becomes a level carrying its single synteny track; every panel lands on
// its ortholog's neighborhood window.
export function buildMultiSyntenyUrl(
  plan: MultiSyntenyPlan,
  flankBp = SYNTENY_FLANK_BP,
) {
  return syntenyViewUrl(
    plan.rows.map((r, i) => ({
      assembly: plan.names[i] ?? r.assembly.accession,
      loc: windowedLoc(r, flankBp),
    })),
    plan.tracks.map(t => [t]),
  )
}

export function formatNumber(n: number) {
  return n.toLocaleString('en-US')
}

// The rows as a spreadsheet, which is where a set of ortholog coordinates
// usually ends up. Tab-separated rather than comma, because assembly common
// names carry commas ("cattle (Hereford L1 Dominette 01449 …, USDA)") and no
// field here can contain a tab, so this needs no quoting rules. Takes whatever
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
      r.assembly.commonName,
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
    r.assembly.commonName,
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
    // First hosted annotation carrying any placed location. Scans every location
    // (not just [0]) so an annotation whose first location lacks a range still
    // resolves off a later placed one, matching locate() in orthologSet.ts.
    for (const ann of gene.annotations ?? []) {
      const assembly = store.find(ann.assembly_accession)
      const loc = ann.genomic_locations?.find(l => l.genomic_range)
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
