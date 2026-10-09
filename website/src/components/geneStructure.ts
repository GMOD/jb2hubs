// Turns a gene symbol into everything a connected JBrowse session needs: the
// gene on a hosted genome, one transcript's coding exons, that transcript's own
// translation, and the AlphaFold model that best matches it. Everything is
// synthesized live — no per-gene data to host:
//
//  - NCBI Datasets : symbol + taxon -> GeneID, assembly, locus, strand,
//                    Swiss-Prot accession; product_report -> which transcript is
//                    MANE / RefSeq Select and which protein each one encodes
//  - NCBI E-utils  : the `gene_table` flat file -> every transcript's genomic
//                    CDS structure (parsed here); efetch -> the picked
//                    transcript's protein sequence. A bacterial or viral gene
//                    has no table, and its CDS comes off the product_report
//  - a hosted config: the genome the session opens on, plus the name that config
//                    gives the gene's sequence and the gene track to draw under
//                    the exons — see genomeTarget.ts
//  - UniProt       : the entries cross-referencing the GeneID, reviewed or
//                    not, so a species Swiss-Prot barely covers still gets a
//                    structure and a map; where NCBI flags no representative
//                    transcript, the isoform that entry describes opens
//  - AlphaFold DB  : the prediction API, which says which models exist for the
//                    accession rather than assuming the canonical F1 file does
//
// The session itself is built in proteinSession.ts.

import { searchUniProtEntries } from 'p2s_mapper'

import { resolveGenomeTarget } from './genomeTarget.ts'
import { DATASETS, EUTILS, ncbiJson, ncbiText } from './ncbiFetch.ts'
import {
  type AlphaFoldModel,
  fetchAlphaFoldModels,
} from './structureSources.ts'

import type { GenomeTarget } from './genomeTarget.ts'

const UNIPROT = 'https://rest.uniprot.org/uniprotkb'

export interface Exon {
  start: number // 0-based interbase
  end: number
}
export interface CDS extends Exon {
  phase: number
}
export interface Transcript {
  // as the source names it: an NCBI accession (NC_000077.7) off the gene_table,
  // or a UCSC name off the 100-way sidecar. buildSessionUrl renames it to
  // whatever the target config calls that sequence.
  refName: string
  strand: 1 | -1
  name: string // RefSeq mRNA accession
  geneName: string
  cds: CDS[] // genomic ascending, coding only
}

type TranscriptTag = 'MANE Select' | 'RefSeq Select'

// One isoform the gene encodes: its exon model, the protein it translates to,
// and whether NCBI flags it as the representative transcript.
export interface Isoform {
  transcript: Transcript
  protein: string // RefSeq protein accession.version
  aaLength: number // residues, stop codon excluded
  tag?: TranscriptTag
}

export interface GeneStructure {
  symbol: string
  geneId: string
  taxId: number
  assemblyAccession: string
  // the genome this gene's session opens on, resolved from the accession
  target: GenomeTarget
  transcript: Transcript
  // every coding isoform, representative first, for the reader to pick from
  isoforms: Isoform[]
  uniprotId?: string
  // The translation of `transcript` — the sequence the ProteinView aligns to
  // the structure's own residues so that a structure of another isoform (or a
  // truncated PDB entry) still maps onto the right codons. It is deliberately
  // NOT the UniProt canonical: that is the structure's sequence, and handing it
  // over as the transcript's would make the pairwise alignment an identity and
  // index the CDS with the wrong protein whenever the isoforms differ.
  proteinSequence?: string
  // UniProt's canonical sequence for `uniprotId`, as UniProt serves it
  canonical?: string
  // every AlphaFold model the accession has, in the API's order
  alphafold: AlphaFoldModel[]
}

// The canonical sequence — the coordinate space the map's regions are on —
// else the canonical AlphaFold model, folded from it. Never the translation:
// MANE and the canonical differ for KMT2A (3972 and 3969 residues), PLEC and
// TTN, and a range on one read as the other lands residues away.
export function canonicalSequence(structure: GeneStructure) {
  return (
    structure.canonical ??
    structure.alphafold.find(m => !m.accession.includes('-'))?.sequence
  )
}

// Best effort, and never a rejection: without it the map counts on the
// canonical AlphaFold model, and the card calls a focus approximate.
async function fetchUniProtSequence(accession: string) {
  try {
    const res = await fetch(`${UNIPROT}/${accession}.fasta`, {
      signal: AbortSignal.timeout(20_000),
    })
    const fasta = res.ok ? await res.text() : ''
    return fasta.split('\n').slice(1).join('') || undefined
  } catch {
    return undefined
  }
}

// --- gene resolution ---------------------------------------------------------

interface DatasetsGeneReport {
  reports?: {
    gene?: {
      gene_id?: string
      symbol?: string
      swiss_prot_accessions?: string[]
      annotations?: {
        assembly_accession?: string
        genomic_locations?: {
          genomic_accession_version?: string
          genomic_range?: { begin?: string; orientation?: string }
        }[]
      }[]
    }
  }[]
}

export interface PlacedAnnotation {
  assemblyAccession: string
  refName: string
  strand: 1 | -1
}

// EVERY assembly NCBI places the gene on, in its order — not just the first.
// NCBI annotates several assemblies per species, and the exon table covers one
// of them, which need not lead: zebrafish tp53 is placed on GRCz12ab and
// GRCz12tu, 386 kb apart on their chromosome 5s, and its table is GRCz12ab's.
// The caller keeps the placement the table is on.
export function placedAnnotations(
  gene: NonNullable<DatasetsGeneReport['reports']>[number]['gene'],
): PlacedAnnotation[] {
  return (gene?.annotations ?? []).flatMap(a => {
    const loc = a.genomic_locations?.find(l => l.genomic_range?.begin)
    return a.assembly_accession && loc?.genomic_accession_version
      ? [
          {
            assemblyAccession: a.assembly_accession,
            refName: loc.genomic_accession_version,
            strand:
              loc.genomic_range?.orientation === 'minus'
                ? (-1 as const)
                : (1 as const),
          },
        ]
      : []
  })
}

interface ResolvedGene {
  symbol: string
  geneId: string
  placements: PlacedAnnotation[]
  uniprotId?: string
}

// The symbol endpoint answers with near matches as well as the exact one, and
// not exact-first: `TTN` in human returns TTR (transthyretin) ahead of titin.
// Taking reports[0] therefore opens a different gene than the one asked for,
// silently and with a plausible-looking result. Match the symbol first.
function pickReport(json: DatasetsGeneReport, symbol: string) {
  const reports = json.reports ?? []
  const wanted = symbol.trim().toLowerCase()
  return (
    reports.find(r => r.gene?.symbol?.toLowerCase() === wanted)?.gene ??
    reports[0]?.gene
  )
}

// Gene symbol + taxon -> GeneID, its placements, and Swiss-Prot. The coordinates
// are relative to the annotation NCBI reports, which is the coordinate space the
// matching assembly's 2bit uses.
export async function resolveGene(
  symbol: string,
  taxId: number,
  signal?: AbortSignal,
): Promise<ResolvedGene> {
  const json = await ncbiJson<DatasetsGeneReport>(
    `${DATASETS}/gene/symbol/${encodeURIComponent(symbol)}/taxon/${taxId}`,
    { signal },
  )
  const gene = pickReport(json, symbol)
  const placements = placedAnnotations(gene)
  if (!gene?.gene_id || placements.length === 0) {
    throw new Error(`No placed locus for "${symbol}" in taxon ${taxId}`)
  }
  return {
    symbol: gene.symbol ?? symbol,
    geneId: gene.gene_id,
    placements,
    uniprotId: gene.swiss_prot_accessions?.[0],
  }
}

// A UniProt entry that cross-references the gene, and the RefSeq proteins it
// says it describes. `canonical` marks a protein UniProt maps to the entry's
// displayed isoform (an `isoformId` ending -1), or to the entry as a whole when
// it names no isoform.
export interface UniProtCandidate {
  accession: string
  reviewed: boolean
  referenceProteome: boolean
  refseq: { protein: string; canonical: boolean }[]
}

interface UniProtSearch {
  results?: {
    primaryAccession?: string
    entryType?: string
    keywords?: { id?: string }[]
    uniProtKBCrossReferences?: {
      database?: string
      id?: string
      isoformId?: string
    }[]
  }[]
}

export function parseUniProtCandidates(json: UniProtSearch) {
  return (json.results ?? []).flatMap((r): UniProtCandidate[] =>
    r.primaryAccession
      ? [
          {
            accession: r.primaryAccession,
            reviewed: !!r.entryType?.includes('Swiss-Prot'),
            referenceProteome: !!r.keywords?.some(k => k.id === 'KW-1185'),
            refseq: (r.uniProtKBCrossReferences ?? []).flatMap(x =>
              x.database === 'RefSeq' && x.id
                ? [
                    {
                      protein: x.id,
                      canonical: !x.isoformId || x.isoformId.endsWith('-1'),
                    },
                  ]
                : [],
            ),
          },
        ]
      : [],
  )
}

// Every entry naming the GeneID, which is the cross-reference UniProt keeps for
// any organism NCBI annotates. Best effort: a failure means no structure, never
// no gene.
async function fetchUniProtCandidates(geneId: string, signal?: AbortSignal) {
  const res = await fetch(
    `${UNIPROT}/search?query=xref:geneid-${geneId}&fields=accession,reviewed,keyword,xref_refseq&format=json&size=25`,
    { signal },
  ).catch(() => undefined)
  return res?.ok
    ? parseUniProtCandidates((await res.json()) as UniProtSearch)
    : []
}

// The entry the gene's structure and map come from: reviewed first, then one
// describing a curated RefSeq protein, then a reference-proteome entry, then
// one describing any RefSeq protein. Zebra finch FOXP2 has no reviewed entry;
// its five TrEMBL ones are the curated NP_001041728's, two reference-proteome
// ones on predicted proteins, and two on retired predictions.
export function pickUniProt(candidates: UniProtCandidate[]) {
  const rank = (c: UniProtCandidate) =>
    c.reviewed
      ? 0
      : c.refseq.some(r => r.protein.startsWith('NP_'))
        ? 1
        : c.referenceProteome
          ? 2
          : c.refseq.length > 0
            ? 3
            : 4
  return [...candidates].sort((a, b) => rank(a) - rank(b))[0]
}

// Where NCBI flags no representative transcript, which is everywhere outside
// human and mouse, the isoform the UniProt entry describes leads, its
// canonical first: the longest isoform, the old pick, is the one least likely
// to be the entry's sequence (Dscam1's longest is 2,034 residues against
// UniProt's 2,016).
export function leadWithEntry(
  isoforms: Isoform[],
  entry: UniProtCandidate | undefined,
) {
  if (!entry || isoforms[0]?.tag) {
    return isoforms
  }
  const described = (iso: Isoform) =>
    entry.refseq.find(
      r => bareAccession(r.protein) === bareAccession(iso.protein),
    )
  const lead =
    isoforms.find(i => described(i)?.canonical) ??
    isoforms.find(i => described(i))
  return lead ? [lead, ...isoforms.filter(i => i !== lead)] : isoforms
}

// --- gene_table parsing ------------------------------------------------------
// `efetch db=gene rettype=gene_table` lists, per transcript, an exon table whose
// "Genomic Interval Coding" column gives each CDS exon's genomic coordinates
// (1-based inclusive) — all the collapsed-intron view needs. Those coordinates
// are on the one sequence the table's header names, and on no other assembly.

// The sequence the table's coordinates are on, off its header. Human and mouse
// write `Reference GRCh38.p14 Primary Assembly NC_000017.11  (minus strand)
// from: …`; yeast, fly, worm and plant drop the words and start at the
// accession.
const TABLE_REFERENCE =
  /^(?:.*?\s)?([A-Z]{1,4}_?\d+\.\d+)\s+(?:\([^)\n]*\)\s+)?from:/m

export function geneTableReference(text: string) {
  return TABLE_REFERENCE.exec(text)?.[1]
}

// The placement whose sequence the exon table is on. Any other assembly's
// coordinates differ, so a session there would light every codon in the wrong
// place without failing.
export function tablePlacement(
  symbol: string,
  placements: PlacedAnnotation[],
  reference: string | undefined,
) {
  const placement = placements.find(p => p.refName === reference)
  if (!placement) {
    throw new Error(
      reference
        ? `NCBI's exon table for "${symbol}" is on ${reference}, which none of its placements (${placements.map(p => p.refName).join(', ')}) name`
        : `NCBI has no exon table for "${symbol}", and its product report gives no coding blocks that spell the protein, so there are no exons to place`,
    )
  }
  return placement
}

// Parse "a-b" with start <= end; minus-strand rows list intervals high-to-low.
function parseInterval(token: string) {
  const m = /^(\d+)-(\d+)$/.exec(token)
  return m
    ? {
        start: Math.min(Number(m[1]), Number(m[2])),
        end: Math.max(Number(m[1]), Number(m[2])),
      }
    : undefined
}

// A row's coding interval is its second genomic interval when that sits inside
// the exon interval; UTR-only rows carry a gene interval there and are skipped.
function codingFromRow(line: string) {
  const tokens = line.split(/\t+/).map(t => t.trim())
  const exon = parseInterval(tokens[0] ?? '')
  const second = parseInterval(tokens[1] ?? '')
  return exon && second && second.start >= exon.start && second.end <= exon.end
    ? second
    : undefined
}

// GFF phase per CDS in translation order (strand-aware): a complete CDS starts
// in frame, so the running coding length before an exon fixes its phase.
function assignPhases(
  cds: { start: number; end: number }[],
  strand: 1 | -1,
): CDS[] {
  const order = strand === 1 ? cds : [...cds].reverse()
  let coded = 0
  const phased = order.map(c => {
    const phase = (3 - (coded % 3)) % 3
    coded += c.end - c.start
    return { ...c, phase }
  })
  return strand === 1 ? phased : phased.reverse()
}

interface ParsedTranscript {
  mrna: string
  protein: string
  // translated residues. The coding intervals include the stop codon, so this
  // is one codon short of their length — the number that matches a protein
  // record, which is what it is compared against.
  aaLength: number
  cds: CDS[]
}

export function parseGeneTableBlocks(
  text: string,
  strand: 1 | -1,
): ParsedTranscript[] {
  const out: ParsedTranscript[] = []
  for (const block of text.split(/\nExon table for /).slice(1)) {
    const header = /mRNA\s+(\S+)\s+and protein\s+(\S+)/.exec(block)
    const mrna = header?.[1]
    const protein = header?.[2]
    if (mrna && protein) {
      const coding = block
        .split('\n')
        .filter(l => /^\d+-\d+/.test(l.trim()))
        .map(codingFromRow)
        .filter((c): c is { start: number; end: number } => !!c)
        .map(c => ({ start: c.start - 1, end: c.end }))
        .sort((a, b) => a.start - b.start)
      if (coding.length > 0) {
        const codons = Math.round(
          coding.reduce((n, c) => n + (c.end - c.start), 0) / 3,
        )
        out.push({
          mrna,
          protein,
          aaLength: Math.max(0, codons - 1),
          cds: assignPhases(coding, strand),
        })
      }
    }
  }
  return out
}

// --- the representative transcript -------------------------------------------

// Which transcripts NCBI flags as representative, by mRNA accession. MANE
// Select exists for human alone and RefSeq Select for few others: zebrafish
// tp53, zebra finch FOXP2 and fly Dscam1 carry neither (2026-10-09). Without a
// flag the UniProt entry's isoform leads (leadWithEntry), else the longest
// curated one.
interface ProductReport {
  reports?: {
    product?: {
      transcripts?: {
        accession_version?: string
        select_category?: string
        genomic_locations?: {
          genomic_accession_version?: string
          genomic_range?: { orientation?: string }
          exons?: { begin?: string; end?: string }[]
        }[]
        protein?: { accession_version?: string; length?: number }
      }[]
    }
  }[]
}

async function fetchProductReport(geneId: string, signal?: AbortSignal) {
  return ncbiJson<ProductReport>(
    `${DATASETS}/gene/id/${geneId}/product_report`,
    { signal },
  ).catch(() => undefined)
}

export function selectTags(report: ProductReport | undefined) {
  const tags = new Map<string, TranscriptTag>()
  for (const t of report?.reports?.[0]?.product?.transcripts ?? []) {
    const tag: TranscriptTag | undefined =
      t.select_category === 'MANE_SELECT'
        ? 'MANE Select'
        : t.select_category === 'REFSEQ_SELECT'
          ? 'RefSeq Select'
          : undefined
    if (t.accession_version && tag) {
      tags.set(t.accession_version, tag)
    }
  }
  return tags
}

const bareAccession = (acc: string) => acc.replace(/\.\d+$/, '')

interface UntabledTranscript extends ParsedTranscript {
  refName: string
}

// A bacterial or viral gene has no transcript record, so its gene_table reads
// "no table for this gene because it has no annotated transcribed products".
// The product_report still lists each protein with the genomic intervals that
// code for it (1-based inclusive, stop codon included, as the table's are), so
// the coding model comes from there, named by the protein since no mRNA is.
export function parseProductTranscripts(
  report: ProductReport,
): UntabledTranscript[] {
  // One per sequence the product is placed on: NCBI lists a gene's placement
  // on each assembly it annotates, and the caller keeps the hosted one.
  return (report.reports?.[0]?.product?.transcripts ?? []).flatMap(t =>
    (t.genomic_locations ?? []).flatMap(location =>
      productTranscript(t, location),
    ),
  )
}

type ProductTranscript = NonNullable<
  NonNullable<
    NonNullable<ProductReport['reports']>[number]['product']
  >['transcripts']
>[number]

function productTranscript(
  t: ProductTranscript,
  location: NonNullable<ProductTranscript['genomic_locations']>[number],
): UntabledTranscript[] {
  const protein = t.protein?.accession_version
  const refName = location.genomic_accession_version
  const coding = (location.exons ?? [])
    .flatMap(e => {
      const begin = Number(e.begin)
      const end = Number(e.end)
      return Number.isInteger(begin) && Number.isInteger(end) && begin > 0
        ? [{ start: Math.min(begin, end) - 1, end: Math.max(begin, end) }]
        : []
    })
    .sort((a, b) => a.start - b.start)
  const codons = coding.reduce((n, c) => n + (c.end - c.start), 0) / 3
  const length = t.protein?.length
  // The blocks have to spell the protein: its residues and a stop codon, or
  // its residues alone for a mature peptide cut from a polyprotein. A
  // ribosomal frameshift still does, since NCBI lists the slipped base in
  // both blocks (SARS-CoV-2 ORF1ab re-reads 13468); a partial gene or an
  // edited transcript does not, and would put its residues on the wrong
  // bases.
  return protein &&
    refName &&
    length !== undefined &&
    (codons === length || codons === length + 1)
    ? [
        {
          refName,
          mrna: t.accession_version ?? protein,
          protein,
          aaLength: length,
          cds: assignPhases(
            coding,
            location.genomic_range?.orientation === 'minus' ? -1 : 1,
          ),
        },
      ]
    : []
}

// NCBI's gene record names a Swiss-Prot entry for few genes outside the
// vertebrates, and a symbol search misses wherever the assembly's taxon is not
// the one Swiss-Prot files the organism under (E. coli MG1655 is 511145, its
// entries are K-12's, 83333). UniProt cross-references the RefSeq protein
// itself, which names the entry whatever the taxon.
async function uniProtForProtein(
  protein: string,
  symbol: string,
  taxId: number,
  signal?: AbortSignal,
) {
  const found = await searchUniProtEntries(
    {
      recognizedIds: [bareAccession(protein)],
      geneName: symbol,
      organismId: taxId,
    },
    { signal },
  ).catch(() => undefined)
  const reviewed = found?.entries.filter(e => e.isReviewed) ?? []
  return (reviewed.length === 1 ? reviewed[0] : found?.entries[0])?.accession
}

// Representative first, then curated (NM_) before predicted (XM_), then longest.
// The tag is matched version-tolerant: product_report and gene_table come off
// the same annotation, but a version drift between them should cost nothing.
export function orderIsoforms(
  transcripts: ParsedTranscript[],
  tags: Map<string, TranscriptTag>,
  base: Omit<Transcript, 'name' | 'cds'>,
): Isoform[] {
  const tagFor = (mrna: string) =>
    tags.get(mrna) ??
    [...tags].find(([acc]) => bareAccession(acc) === bareAccession(mrna))?.[1]
  const rank = (iso: Isoform) =>
    iso.tag ? 0 : /^N[MR]_/.test(iso.transcript.name) ? 1 : 2
  return transcripts
    .map((t): Isoform => ({
      transcript: { ...base, name: t.mrna, cds: t.cds },
      protein: t.protein,
      aaLength: t.aaLength,
      tag: tagFor(t.mrna),
    }))
    .sort((a, b) => rank(a) - rank(b) || b.aaLength - a.aaLength)
}

// The protein a RefSeq transcript encodes, off its NP_/XP_ record.
export async function fetchProteinSequence(
  accession: string,
  signal?: AbortSignal,
) {
  const text = await ncbiText(
    `${EUTILS}/efetch.fcgi?db=protein&id=${accession}&rettype=fasta&retmode=text`,
    { signal },
  )
  const [, ...seq] = text.trim().split('\n')
  return seq.join('')
}

// --- assembling a GeneStructure ----------------------------------------------

// The genome the exon table's assembly opens on, or why there is none.
async function hostedTarget(symbol: string, placement: PlacedAnnotation) {
  const target = await resolveGenomeTarget(placement.assemblyAccession).catch(
    () => undefined,
  )
  if (!target) {
    throw new Error(
      `No hosted genome for "${symbol}": NCBI's exon table is on ${placement.assemblyAccession}, which this site does not serve`,
    )
  }
  return target
}

// A fired `signal` rejects with its reason, including where a best-effort step
// would otherwise swallow the abort and hand back a partial structure.
export async function fetchGeneStructure(
  symbol: string,
  taxId: number,
  signal?: AbortSignal,
): Promise<GeneStructure> {
  const gene = await resolveGene(symbol, taxId, signal)
  // None of these is an NCBI call, so they overlap the throttled ones below.
  const structureOf = (accession: string | undefined) => ({
    alphafold: accession
      ? fetchAlphaFoldModels(accession)
      : Promise.resolve([]),
    canonical: accession
      ? fetchUniProtSequence(accession)
      : Promise.resolve(undefined),
  })
  const named = fetchUniProtCandidates(gene.geneId, signal).then(candidates => {
    const entry =
      candidates.find(c => c.accession === gene.uniprotId) ??
      pickUniProt(candidates)
    const accession = gene.uniprotId ?? entry?.accession
    return { entry, accession, ...structureOf(accession) }
  })
  const report = await fetchProductReport(gene.geneId, signal)
  const tags = selectTags(report)
  const text = await ncbiText(
    `${EUTILS}/efetch.fcgi?db=gene&id=${gene.geneId}&rettype=gene_table&retmode=text`,
    { signal },
  )
  const reference = geneTableReference(text)
  const untabled = reference ? [] : parseProductTranscripts(report ?? {})
  const placement = tablePlacement(
    gene.symbol,
    gene.placements,
    reference ??
      untabled.find(t => gene.placements.some(p => p.refName === t.refName))
        ?.refName,
  )
  const target = await hostedTarget(gene.symbol, placement)
  const { entry, accession: namedUniprotId, ...namedStructure } = await named
  const isoforms = leadWithEntry(
    orderIsoforms(
      reference
        ? parseGeneTableBlocks(text, placement.strand)
        : untabled.filter(t => t.refName === placement.refName),
      tags,
      {
        refName: placement.refName,
        strand: placement.strand,
        geneName: gene.symbol,
      },
    ),
    entry,
  )
  const picked = isoforms[0]
  if (!picked) {
    throw new Error(`No coding transcript in gene_table for ${symbol}`)
  }
  const proteinSequence = await fetchProteinSequence(
    picked.protein,
    signal,
  ).catch(() => undefined)
  const uniprotId =
    namedUniprotId ??
    (await uniProtForProtein(picked.protein, gene.symbol, taxId, signal))
  const { alphafold, canonical } = namedUniprotId
    ? namedStructure
    : structureOf(uniprotId)
  signal?.throwIfAborted()
  return {
    symbol: gene.symbol,
    geneId: gene.geneId,
    taxId,
    assemblyAccession: placement.assemblyAccession,
    target,
    uniprotId,
    proteinSequence,
    transcript: picked.transcript,
    isoforms,
    canonical: await canonical,
    alphafold: await alphafold,
  }
}

// --- collapsed-intron geometry -----------------------------------------------

const DEFAULT_PADDING = 40

export function blockBounds(blocks: Exon[]) {
  return {
    start: Math.min(...blocks.map(b => b.start)),
    end: Math.max(...blocks.map(b => b.end)),
  }
}

export interface LocOptions {
  // false shows the whole coding span (introns intact) as a single region
  collapse?: boolean
  padding?: number
  // list the regions last-to-first, each reversed, so a minus-strand gene reads
  // 5'->3' left to right
  flip?: boolean
}

// Expand each CDS by padding, merge overlaps, then emit one locstring per merged
// block. Giving the LGV these as space-separated regions squeezes the introns
// out (there is no collapseIntrons option — this IS how it's done declaratively).
// Flipping adds core's `[rev]` suffix to each region and reverses their order,
// which is how the CollapseIntronsDialog makes a minus-strand gene read 5'->3'.
export function collapsedLoc(
  transcript: Transcript,
  { collapse = true, padding = DEFAULT_PADDING, flip = false }: LocOptions = {},
) {
  const { refName, cds } = transcript
  const merged: Exon[] = []
  if (collapse) {
    for (const c of [...cds].sort((a, b) => a.start - b.start)) {
      const start = Math.max(0, c.start - padding)
      const end = c.end + padding
      const last = merged.at(-1)
      if (last && start <= last.end) {
        last.end = Math.max(last.end, end)
      } else {
        merged.push({ start, end })
      }
    }
  } else {
    merged.push(blockBounds(cds))
  }
  const suffix = flip ? '[rev]' : ''
  const locs = merged.map(e => `${refName}:${e.start + 1}-${e.end}${suffix}`)
  return (flip ? locs.reverse() : locs).join(' ')
}
