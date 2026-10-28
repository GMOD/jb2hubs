import {
  genarkConfigPath,
  jbrowseUrl,
  ucscConfigPath,
} from '../config/jbrowse.ts'
import { matchesAllTerms, searchTerms } from '../lib/searchTerms.ts'
import { hostedPlacements } from './genePlacements.ts'
import {
  flipLoc,
  mergeConfig,
  panelTracks,
  specUrl,
  syntenyViewUrl,
} from './jbrowseLinks.ts'
import { resolveStackNames, syntenyLink } from './syntenyPairIndex.ts'

import type { AssemblyStore } from './orthologDb.ts'
import type { PairIndex, SyntenyLink } from './syntenyPairIndex.ts'

// The species identity of one ortholog row: its hosted assembly and NCBI's
// names. `commonName` is missing on ~15% of NCBI rows; the table then shows the
// scientific name alone.
export interface Assembly {
  accession: string
  scientificName: string
  commonName?: string
  taxonId: number
  // UCSC browser db (hg38, mm39, …) for a native UCSC genome; picks the
  // launch's JBrowse config.
  ucscDb?: string
  // the gene track a launch of that UCSC genome opens
  geneTrack?: string
}

// The suggested reference species. `names` are alternate spellings resolved
// here, because NCBI's taxonomy search ranks "fruit fly" as D. gunungcola
// first. `replaces` lists taxon ids to read as this one.
interface CommonSpecies {
  label: string
  taxId: number
  names: string[]
  replaces?: number[]
}

export const COMMON_SPECIES: CommonSpecies[] = [
  { label: 'Human', taxId: 9606, names: ['Homo sapiens', 'H. sapiens'] },
  {
    label: 'Mouse',
    taxId: 10090,
    names: ['Mus musculus', 'M. musculus', 'house mouse'],
  },
  {
    label: 'Rat',
    taxId: 10116,
    names: ['Rattus norvegicus', 'R. norvegicus', 'Norway rat', 'brown rat'],
  },
  { label: 'Zebrafish', taxId: 7955, names: ['Danio rerio', 'D. rerio'] },
  { label: 'Chicken', taxId: 9031, names: ['Gallus gallus', 'G. gallus'] },
  {
    label: 'Dog',
    taxId: 9615,
    names: ['Canis lupus familiaris', 'Canis familiaris'],
  },
  { label: 'Cow', taxId: 9913, names: ['Bos taurus', 'cattle'] },
  { label: 'Pig', taxId: 9823, names: ['Sus scrofa'] },
  {
    label: 'Frog (X. tropicalis)',
    taxId: 8364,
    names: ['Xenopus tropicalis', 'X. tropicalis', 'tropical clawed frog'],
  },
  {
    label: 'Fruitfly',
    taxId: 7227,
    names: [
      'Drosophila melanogaster',
      'D. melanogaster',
      'Drosophila',
      'fruit fly',
      'fly',
    ],
  },
  {
    label: 'C. elegans',
    taxId: 6239,
    names: ['Caenorhabditis elegans', 'worm'],
  },
  // S288C, not species taxon 4932, which NCBI files no gene records under.
  {
    label: 'Yeast (S. cerevisiae)',
    taxId: 559292,
    names: [
      'Saccharomyces cerevisiae',
      'Saccharomyces cerevisiae S288C',
      'S. cerevisiae',
      'yeast',
      "baker's yeast",
      "brewer's yeast",
      'budding yeast',
    ],
    replaces: [4932],
  },
  {
    label: 'Arabidopsis',
    taxId: 3702,
    names: ['Arabidopsis thaliana', 'A. thaliana', 'thale cress'],
  },
]

// Reference species offered beside the model organisms, for genes that have a
// structure and genome but no ortholog table. Each taxon is the one NCBI files
// the reference genome's gene records under (MG1655 for E. coli).
const MICROBE_SPECIES: CommonSpecies[] = [
  {
    label: 'E. coli (K-12)',
    taxId: 511145,
    names: ['Escherichia coli', 'E. coli', 'Escherichia coli K-12 MG1655'],
  },
  {
    label: 'B. subtilis (168)',
    taxId: 224308,
    names: ['Bacillus subtilis', 'B. subtilis'],
  },
  {
    label: 'M. tuberculosis (H37Rv)',
    taxId: 83332,
    names: ['Mycobacterium tuberculosis', 'M. tuberculosis', 'TB'],
  },
  {
    label: 'Fission yeast (S. pombe)',
    taxId: 4896,
    names: ['Schizosaccharomyces pombe', 'S. pombe', 'fission yeast'],
  },
  {
    label: 'C. albicans',
    taxId: 237561,
    names: ['Candida albicans', 'Candida albicans SC5314'],
  },
  {
    label: 'SARS-CoV-2',
    taxId: 2697049,
    names: ['Severe acute respiratory syndrome coronavirus 2', 'COVID-19'],
  },
  {
    label: 'HIV-1',
    taxId: 11676,
    names: ['Human immunodeficiency virus 1', 'HIV'],
  },
]

export const PROTEIN_SPECIES = [...COMMON_SPECIES, ...MICROBE_SPECIES]

export const COMMON_TAX_RANK = new Map(
  COMMON_SPECIES.map((s, i) => [s.taxId, i]),
)

// Case, periods and spacing do not tell two names apart: "S. cerevisiae" and
// "s cerevisiae" are one query.
function normalName(text: string) {
  return text.trim().toLowerCase().replaceAll('.', '').replace(/\s+/g, ' ')
}

const KNOWN_NAMES = new Map(
  COMMON_SPECIES.flatMap(s =>
    [s.label, ...s.names].map(n => [normalName(n), s.taxId] as const),
  ),
)

// A reference resolved without a request: a taxon id, or a suggested species by
// its label or any of its names. Undefined for anything NCBI has to answer.
export function knownTaxon(input: string) {
  const q = normalName(input)
  if (/^\d+$/.test(q)) {
    const id = Number(q)
    return COMMON_SPECIES.find(s => s.replaces?.includes(id))?.taxId ?? id
  }
  return KNOWN_NAMES.get(q)
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
  // Set when NCBI placed the ortholog on another version of the hosted assembly
  // (see createStore); the coordinates are that version's.
  otherVersion?: string
  geneSymbol: string
  geneId: string
  chromosome: string
  // NCBI's sequence accession (NC_000017.11), which both config kinds resolve
  // through their chromAlias; `chromosome` is a display name
  refName: string
  begin: number
  end: number
  jbrowseUrl: string
  // Strand on its own assembly, from NCBI's `genomic_range.orientation`;
  // decides which panels `strandFlips` flips. Defaults to 1 when NCBI names
  // none.
  strand: 1 | -1
}

// Single-genome launch URL. A UCSC-native assembly (ucscDb set) uses the
// curated /ucsc/<db> config, because its GenArk config's sequence data 404s.
// Others use the GenArk hub path. NCBI's RefSeq refName in loc resolves through
// chromAlias in both.
export function accessionToJbrowseUrl(
  accession: string,
  gene?: GeneLocus,
  ucscDb?: string,
  ucscGeneTrack?: string,
) {
  const config = ucscDb ? ucscConfigPath(ucscDb) : genarkConfigPath(accession)
  const assembly = ucscDb ?? accession
  // A locus launch opens only the tracks it names: the hub's
  // `<accession>-ncbiGff`, or the UCSC gene track from the ortholog index (its
  // id varies per db). About 1 GCF hub in 300 has no ncbiGff and opens without
  // a gene track.
  const track = ucscDb ? ucscGeneTrack : `${accession}-ncbiGff`
  const tracks = track ? `&tracks=${encodeURIComponent(track)}` : ''
  const url = `${jbrowseUrl(config)}&assembly=${encodeURIComponent(assembly)}${tracks}`
  return gene
    ? `${url}&loc=${encodeURIComponent(geneWindow(gene))}&highlight=${encodeURIComponent(geneHighlight(gene)[0] ?? '')}`
    : url
}

// Opens a fifth of the gene's length either side (1 kb at least), gene
// highlighted.
function geneWindow(g: GeneLocus) {
  return flankLoc(
    g.refName,
    g.start,
    g.end,
    Math.max(1000, Math.round((g.end - g.start) / 5)),
  )
}

// Whether a row's coordinates belong to the genome its synteny panel opens.
// syntenyLink matches version-stripped accessions, so it cannot place a locus:
// NCBI reports against the version it annotated, whose refNames the catalog
// version's chromAlias may not know, and the panel opens at position 0 (5 of 38
// TP53 rows against human). A UCSC db name is another naming scheme, not
// another assembly, so `hg38` matches only the row the ortholog index maps to
// hg38.
export function isSameGenome(
  panelName: string,
  hosted: { accession: string; ucscDb?: string },
) {
  return panelName === hosted.accession || panelName === hosted.ucscDb
}

// Whether a row's coordinates are the hosted version's own, rather than those
// of a version NCBI annotated and we do not host.
export function placedOnHosted(r: OrthologResult) {
  return r.otherVersion === undefined
}

// The synteny link for a row, only when its panel is the genome the row's
// coordinates came from. Callers that navigate the panel use this, not
// syntenyLink. A row NCBI placed on another version gets none. refName only
// where the two versions share that sequence.
export function orthologSyntenyLink(
  index: PairIndex,
  r: OrthologResult,
  otherAccession: string,
) {
  const link = syntenyLink(index, r.assembly.accession, otherAccession)
  return link && placedOnHosted(r) && isSameGenome(link.names[0], r.assembly)
    ? link
    : undefined
}

// bp of context either side of the ortholog gene; at gene scale the ribbons
// would be invisible.
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

// A gene's place on its own genome, under the refName a launch navigates by.
export interface GeneLocus {
  refName: string
  start: number
  end: number
}

function locusOf(r: OrthologResult): GeneLocus {
  return { refName: r.refName, start: r.begin, end: r.end }
}

function windowedLoc(r: OrthologResult, flankBp: number) {
  return flankLoc(r.refName, r.begin, r.end, flankBp)
}

// The gene itself, marked in a panel that opens on a window around it.
function geneHighlight({ refName, start, end }: GeneLocus) {
  return [`${refName}:${start}-${end}`]
}

// The pairwise ortholog-vs-reference launch. The ortholog's panel leads and
// flips, since the reference is the reader's frame. Each panel gets its own
// gene track because a synteny sub-view has no defaultSession. Panel assemblies
// come from the link, not the accessions: naming the accession merges a hub
// without the track.
export function pairwiseOrthologUrl(
  link: SyntenyLink,
  ortholog: GeneLocus,
  ref: GeneLocus | undefined,
  flipped: boolean,
  flankBp = SYNTENY_FLANK_BP,
) {
  const window = (g: GeneLocus) => flankLoc(g.refName, g.start, g.end, flankBp)
  return syntenyViewUrl(
    [
      {
        assembly: link.names[0],
        loc: flipLoc(window(ortholog), flipped),
        highlight: geneHighlight(ortholog),
        ...panelTracks(link.geneTracks[0]),
      },
      {
        assembly: link.names[1],
        ...(ref ? { loc: window(ref), highlight: geneHighlight(ref) } : {}),
        ...panelTracks(link.geneTracks[1]),
      },
    ],
    [link.trackId],
    // No autoDiagonalize: it reverses the reference panel to match a flipped
    // ortholog panel, undoing the flip.
    {
      encoding: { color: { field: 'query' } },
      mark: { interpolate: 'bump' },
    },
  )
}

// Which synteny stack rows open flipped, so the ortholog points the same way in
// every panel (BRCA1 is minus on hg38 chr17 and plus on chimp). The top row is
// the frame, because the chain grows outward from a mid-stack reference and
// anchoring there would flip more rows. fewer rows.
export function strandFlips(rows: OrthologResult[]) {
  const anchor = rows[0]?.strand ?? 1
  return rows.map(r => r.strand !== anchor)
}

// A table row's pairwise launch against the reference row, which is left
// unnavigated when unknown or placed on a version we do not host. The row's
// panel flips when its ortholog runs the other way from the reference's.
export function orthoSyntenyUrl(
  r: OrthologResult,
  link: SyntenyLink,
  refRow: OrthologResult | undefined,
  flankBp = SYNTENY_FLANK_BP,
) {
  const ref = refRow && placedOnHosted(refRow) ? refRow : undefined
  return pairwiseOrthologUrl(
    link,
    locusOf(r),
    ref && locusOf(ref),
    ref !== undefined && r.strand !== ref.strand,
    flankBp,
  )
}

export interface MultiSyntenyPlan {
  // top-to-bottom row order
  rows: OrthologResult[]
  // names[i] is the assembly name rows[i]'s panel opens under, which is not
  // always the accession — see pairwiseOrthologUrl
  names: (string | undefined)[]
  // geneTracks[i] is the gene track rows[i]'s panel opens, '' where the catalog
  // knows none
  geneTracks: string[]
  // tracks[i] holds the synteny track linking rows[i] and rows[i + 1], and is
  // empty where none does: JBrowse binds tracks to levels by position, so a
  // missing level has to keep its slot
  tracks: string[][]
}

// Orders the ortholog rows into a chain where every adjacent pair has a synteny
// track: a LinearSyntenyView draws ribbons only between adjacent rows. The
// chain grows outward from the reference at both ends, each step taking the
// closest-ranked unused species with a track to the chain's end. A star-shaped
// catalog (every ortholog links only to the reference) yields 3 rows, the
// reference flanked by its two nearest partners; path-shaped catalogs yield
// longer stacks. Returns null when nothing chains to the reference.
export function planMultiSynteny(
  results: OrthologResult[],
  refAccession: string,
  index: PairIndex,
): MultiSyntenyPlan | null {
  const ref = results.find(r => r.assembly.accession === refAccession)
  if (!ref) {
    return null
  }
  // A row's index is its preference rank: syntenyCandidates
  // (multiSyntenyPicker.ts) passes shared-lineage order; a raw result set ranks
  // by COMMON_TAX_RANK, then name. Greedy on purpose: a DFS over TP53's catalog
  // finds an arbitrary 12-genome chain.
  const rank = new Map(results.map((r, i) => [r.assembly.accession, i]))
  const used = new Set([refAccession])
  const chain = [ref]
  // The assembly name each chained row's panel opens under, fixed by its
  // placing link. A genome known under two names (UCSC dm6 and its accession)
  // can be one panel only, so an extension whose link disagrees with the
  // assigned name, or names another version than the row's, is not a valid
  // step.
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
      if (
        link &&
        rk < bestRank &&
        (!settled || settled === link.names[0]) &&
        isSameGenome(link.names[0], node.assembly) &&
        isSameGenome(link.names[1], r.assembly)
      ) {
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
  // The resolver reproduces `names` and drops nothing; going through it keeps
  // one copy of the panel-naming rule.
  const stack = resolveStackNames(
    chain.map(r => r.assembly.accession),
    index,
    (i, name) => {
      const row = chain[i]
      return row !== undefined && isSameGenome(name, row.assembly)
    },
  )
  return { rows: chain, ...stack }
}

// Multi-row LinearSyntenyView launch URL: one level per adjacent pair carrying
// its synteny track, each panel on its ortholog's window with its gene track
// open, flipped where the ortholog runs the other way.
export function buildMultiSyntenyUrl(
  plan: MultiSyntenyPlan,
  flankBp = SYNTENY_FLANK_BP,
) {
  const flips = strandFlips(plan.rows)
  return syntenyViewUrl(
    plan.rows.map((r, i) => ({
      assembly: plan.names[i] ?? r.assembly.accession,
      loc: flipLoc(windowedLoc(r, flankBp), flips[i] ?? false),
      highlight: geneHighlight(locusOf(r)),
      ...panelTracks(plan.geneTracks[i] ?? ''),
    })),
    plan.tracks,
  )
}

// Rows side by side as LinearGenomeViews in one merged session; no track has to
// join rows, so any set of genomes works. A UCSC genome opens under its db with
// the index's gene track, a GenArk hub under its accession with its NCBI GFF3.
export function sideBySideUrl(rows: OrthologResult[]) {
  const names = rows.map(r => r.assembly.ucscDb ?? r.assembly.accession)
  return specUrl(
    mergeConfig(names),
    rows.map((r, i) => {
      const track = r.assembly.ucscDb
        ? r.assembly.geneTrack
        : `${r.assembly.accession}-ncbiGff`
      return {
        type: 'LinearGenomeView',
        assembly: names[i],
        loc: geneWindow(locusOf(r)),
        highlight: geneHighlight(locusOf(r)),
        ...(track ? { tracks: [track] } : {}),
      }
    }),
  )
}

// How many times the reference gene's span this row's gene covers.
export function geneSpanRatio(r: OrthologResult, ref: OrthologResult) {
  return (r.end - r.begin + 1) / Math.max(1, ref.end - ref.begin + 1)
}

// NCBI names a scaffold "Unplaced Scaffold" or "25 Unlocalized Scaffold",
// which says nothing about which one, and leaves a few sequences unnamed; the
// accession names it.
export function sequenceLabel(name: string | undefined, accession: string) {
  return name && !/scaffold/i.test(name) ? name : accession
}

export function formatNumber(n: number) {
  return n.toLocaleString('en-US')
}

// 17:7,668,421–7,687,490 −
export function locusText(
  refName: string,
  start: number,
  end: number,
  strand: number,
) {
  return `${refName}:${formatNumber(start)}–${formatNumber(end)} ${strand > 0 ? '+' : '−'}`
}

// The rows as TSV: tab, not comma, because common names carry commas and no
// field holds a tab. Takes the caller's on-screen rows.
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
    'strand',
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
      r.refName,
      r.chromosome,
      r.begin,
      r.end,
      r.strand > 0 ? '+' : '-',
      r.jbrowseUrl,
    ].join('\t'),
  )
  return [header.join('\t'), ...rows].join('\n')
}

// Free-text row filter over species names, the ortholog's symbol (LOC… when
// uncharacterised) and the accession. Whitespace-separated terms are ANDed.
export function matchesQuery(r: OrthologResult, query: string) {
  return matchesAllTerms(
    [
      r.assembly.scientificName,
      r.assembly.commonName ?? '',
      r.geneSymbol,
      r.assembly.accession,
    ].join(' '),
    searchTerms(query),
  )
}

export function buildOrthologResults(
  reports: NcbiOrthologReport[],
  store: AssemblyStore,
): OrthologResult[] {
  const results: OrthologResult[] = []

  for (const { gene } of reports) {
    // Rows group by clade and match the reference by taxon, so a report without
    // `tax_id` has no place. All 658 TP53 reports carry one.
    const taxonId = Number(gene.tax_id)
    if (!Number.isFinite(taxonId)) {
      continue
    }
    // A placement on the very version we host beats an earlier one that only
    // shares its base accession
    const placed = hostedPlacements(gene, store)
    const hit = placed.find(p => p.hosted.exact) ?? placed[0]
    if (hit) {
      const { hosted, refName, start: begin, end } = hit
      const assembly: Assembly = {
        accession: hosted.accession,
        ucscDb: hosted.ucscDb,
        geneTrack: hosted.geneTrack,
        scientificName: gene.taxname ?? String(taxonId),
        commonName: gene.common_name,
        taxonId,
      }
      results.push({
        assembly,
        ...(hosted.exact ? {} : { otherVersion: hit.assembly }),
        geneSymbol: gene.symbol,
        geneId: gene.gene_id,
        chromosome: sequenceLabel(hit.sequenceName, refName),
        refName,
        begin,
        end,
        strand: hit.strand,
        jbrowseUrl: accessionToJbrowseUrl(
          assembly.accession,
          { refName, start: begin, end },
          assembly.ucscDb,
          assembly.geneTrack,
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
