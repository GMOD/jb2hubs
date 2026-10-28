// Turns a gene symbol into what a connected JBrowse session needs: the gene on
// a hosted genome, one transcript's coding exons and translation, and the
// best-matching AlphaFold model, all synthesized live from:
// - NCBI Datasets and E-utils: placement, Swiss-Prot accession, MANE/RefSeq
//   Select flags, the gene_table exon structure (a bacterial or viral gene has
//   no table, so its CDS comes off the product_report), and protein sequences
// - a hosted config (genomeTarget.ts): the genome and gene track to open
// - UniProt: entries cross-referencing the GeneID, reviewed or not
// - AlphaFold DB: the prediction API, which says which models exist
// proteinSession.ts builds the session.

import { fetchAlphaFoldModels, searchUniProtEntries } from 'p2s_mapper'

import { bareAccession } from '../lib/accession.ts'
import {
  HttpError,
  fetchServiceJson,
  fetchText,
  isGone,
  withDeadline,
} from '../lib/fetchJson.ts'
import { NotHosted, resolveGenomeTarget } from './genomeTarget.ts'
import { DATASETS, EUTILS, ncbiJson, ncbiText } from './ncbiFetch.ts'

import type { GenomeTarget } from './genomeTarget.ts'
import type { AlphaFoldModel } from 'p2s_mapper'

export const UNIPROT = 'https://rest.uniprot.org/uniprotkb'

export interface Exon {
  start: number // 0-based interbase
  end: number
}
export interface CDS extends Exon {
  phase: number
}
export interface Transcript {
  // as the source names it, an NCBI accession (NC_000077.7); buildSessionUrl
  // renames it to the target config's name.
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
  // the organism as NCBI names it, its common name where it has one
  organism?: string
  assemblyAccession: string
  // the genome this gene's session opens on, resolved from the accession
  target: GenomeTarget
  transcript: Transcript
  uniprotId?: string
  // The translation of `transcript`, which the ProteinView aligns to the
  // structure's residues. Never the UniProt canonical: that would make the
  // alignment an identity and mis-index the CDS whenever the isoforms differ.
  proteinSequence?: string
  // UniProt's canonical sequence for `uniprotId`, as UniProt serves it
  canonical?: string
  // every AlphaFold model the accession has, in the API's order
  alphafold: AlphaFoldModel[]
}

// The canonical sequence (the coordinate space of the map's regions), else the
// canonical AlphaFold model's. Never the translation: MANE and the canonical
// differ for KMT2A, PLEC and TTN.
export function canonicalSequence(structure: GeneStructure) {
  return (
    structure.canonical ??
    structure.alphafold.find(m => !m.accession.includes('-'))?.sequence
  )
}

// UniProt answers 400 for an accession it does not recognise, and 404 or 410
// for one it no longer serves; any other failure rejects, for the page to
// retry.
function noSuchEntry(e: unknown) {
  return isGone(e) || (e instanceof HttpError && e.status === 400)
}

async function fetchUniProtSequence(accession: string, signal?: AbortSignal) {
  const fasta = await fetchText(`${UNIPROT}/${accession}.fasta`, signal).catch(
    (e: unknown) => {
      if (!noSuchEntry(e)) {
        throw e
      }
      return ''
    },
  )
  return fasta.split('\n').slice(1).join('') || undefined
}

// --- gene resolution ---------------------------------------------------------

interface DatasetsGeneReport {
  reports?: {
    gene?: {
      gene_id?: string
      symbol?: string
      taxname?: string
      common_name?: string
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

interface PlacedAnnotation {
  assemblyAccession: string
  refName: string
  strand: 1 | -1
}

// Every assembly NCBI places the gene on, not just the first: the exon table
// covers one that need not lead (zebrafish tp53 is on GRCz12ab and GRCz12tu,
// 386 kb apart). The caller keeps the table's placement.
function placedAnnotations(
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
  organism?: string
  placements: PlacedAnnotation[]
  uniprotId?: string
}

// The symbol endpoint returns near matches, not exact-first (`TTN` in human
// returns TTR ahead of titin), so match the symbol before falling back to
// reports[0].
function pickReport(json: DatasetsGeneReport, symbol: string) {
  const reports = json.reports ?? []
  const wanted = symbol.trim().toLowerCase()
  return (
    reports.find(r => r.gene?.symbol?.toLowerCase() === wanted)?.gene ??
    reports[0]?.gene
  )
}

// Gene symbol + taxon -> GeneID, placements and Swiss-Prot. Coordinates are in
// the reported annotation's space, which the matching assembly's 2bit uses.
async function resolveGene(
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
    organism: gene.common_name ?? gene.taxname,
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

async function searchUniProt(query: string, signal?: AbortSignal) {
  return parseUniProtCandidates(
    await fetchServiceJson<UniProtSearch>(
      `${UNIPROT}/search?query=${encodeURIComponent(query)}&fields=accession,reviewed,keyword,xref_refseq&format=json&size=25`,
      'UniProt',
      'its entries for the gene',
      signal,
    ),
  )
}

// Every entry naming the GeneID; where none does, the reviewed entry for the
// symbol in the taxon or below. UniProt cross-references fission yeast to
// PomBase, not NCBI (cdc25, cdc13), and a TrEMBL entry found by name alone
// could be another gene's. The symbol is quoted because UniProt answers 400 to
// a bare one holding `:`.
async function fetchUniProtCandidates(
  gene: { geneId: string; symbol: string },
  taxId: number,
  signal?: AbortSignal,
) {
  const byGeneId = await searchUniProt(`xref:geneid-${gene.geneId}`, signal)
  return byGeneId.length > 0
    ? byGeneId
    : searchUniProt(
        `gene_exact:"${gene.symbol.replaceAll('"', '\\"')}" AND taxonomy_id:${taxId} AND reviewed:true`,
        signal,
      )
}

// The entry the gene's structure and map come from: reviewed first, then one
// describing a curated RefSeq protein, then a reference-proteome entry, then
// one describing any RefSeq protein.
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

// One entry decides the lead isoform and the structure: the gene record's
// Swiss-Prot accession, or none when UniProt's GeneID cross-references miss it.
// Another entry would order isoforms by its own RefSeq map while map and model
// come from NCBI's.
export function pickEntry(
  candidates: UniProtCandidate[],
  swissProt: string | undefined,
) {
  return swissProt
    ? candidates.find(c => c.accession === swissProt)
    : pickUniProt(candidates)
}

// Where NCBI flags no representative transcript (everywhere outside human and
// mouse), the isoform the UniProt entry describes leads, canonical first. The
// longest isoform is least likely to match (Dscam1: 2,034 residues against
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
// `efetch db=gene rettype=gene_table` lists, per transcript, an exon table
// whose "Genomic Interval Coding" column gives CDS exon coordinates (1-based
// inclusive) on the one sequence the table's header names.

// The sequence the table's coordinates are on, off its header. Human and mouse
// write `Reference GRCh38.p14 Primary Assembly NC_000017.11  (minus strand)
// from: …`; yeast, fly, worm and plant drop the words and start at the
// accession.
const TABLE_REFERENCE =
  /^(?:.*?\s)?([A-Z]{1,4}_?\d+\.\d+)\s+(?:\([^)\n]*\)\s+)?from:/m

export function geneTableReference(text: string) {
  return TABLE_REFERENCE.exec(text)?.[1]
}

// The placement whose sequence the exon table is on; another assembly's
// coordinates differ and would light the wrong codons without failing.
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
  // translated residues; the coding intervals include the stop codon, so this
  // is one codon short of their length
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

// Which transcripts NCBI flags as representative, by mRNA accession. Only human
// has MANE Select and few others RefSeq Select (zebrafish tp53, zebra finch
// FOXP2 and fly Dscam1 have neither); leadWithEntry then applies, else the
// longest curated.
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
  )
}

function selectTags(report: ProductReport) {
  const tags = new Map<string, TranscriptTag>()
  for (const t of report.reports?.[0]?.product?.transcripts ?? []) {
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

interface UntabledTranscript extends ParsedTranscript {
  refName: string
}

// A bacterial or viral gene has no gene_table ("no annotated transcribed
// products"), so the product_report's per-protein genomic intervals (1-based
// inclusive, stop codon included) give the coding model, named by the protein
// since no mRNA exists.
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
  // The blocks have to spell the protein: its residues and a stop codon, or its
  // residues alone for a mature peptide cut from a polyprotein. A ribosomal
  // frameshift still does (NCBI lists the slipped base in both blocks,
  // SARS-CoV-2 ORF1ab 13468); a partial gene or edited transcript does not.
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

// NCBI's gene record names a Swiss-Prot entry for few non-vertebrates, and a
// symbol search misses when the assembly's taxon differs from Swiss-Prot's (E.
// coli MG1655 is 511145, its entries are K-12's, 83333). UniProt
// cross-references the RefSeq protein, which names the entry whatever the
// taxon.
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
    { signal: withDeadline(signal) },
  )
  const reviewed = found.entries.filter(e => e.isReviewed)
  return (reviewed.length === 1 ? reviewed[0] : found.entries[0])?.accession
}

// Representative first, then curated (NM_) before predicted (XM_), then
// longest. Tags match version-tolerant, since product_report and gene_table may
// drift in version.
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
async function fetchProteinSequence(accession: string, signal?: AbortSignal) {
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
  return resolveGenomeTarget(placement.assemblyAccession).catch(
    (e: unknown) => {
      if (!(e instanceof NotHosted)) {
        throw e
      }
      throw new Error(
        `No hosted genome for "${symbol}": NCBI's exon table is on ${placement.assemblyAccession}, which this site does not serve`,
        { cause: e },
      )
    },
  )
}

// The transcripts of the exon table, or of the product report where the gene
// has no table, on the placement whose sequence they are on.
async function placedTranscripts(gene: ResolvedGene, signal?: AbortSignal) {
  const report = await fetchProductReport(gene.geneId, signal)
  const text = await ncbiText(
    `${EUTILS}/efetch.fcgi?db=gene&id=${gene.geneId}&rettype=gene_table&retmode=text`,
    { signal },
  )
  const reference = geneTableReference(text)
  const untabled = reference ? [] : parseProductTranscripts(report)
  const placement = tablePlacement(
    gene.symbol,
    gene.placements,
    reference ??
      untabled.find(t => gene.placements.some(p => p.refName === t.refName))
        ?.refName,
  )
  return {
    placement,
    tags: selectTags(report),
    transcripts: reference
      ? parseGeneTableBlocks(text, placement.strand)
      : untabled.filter(t => t.refName === placement.refName),
    target: await hostedTarget(gene.symbol, placement),
  }
}

async function structureOf(
  accession: string | undefined,
  signal?: AbortSignal,
) {
  if (!accession) {
    return { alphafold: [], canonical: undefined }
  }
  const [alphafold, canonical] = await Promise.all([
    fetchAlphaFoldModels(accession, { signal: withDeadline(signal) }),
    fetchUniProtSequence(accession, signal),
  ])
  return { alphafold, canonical }
}

// The UniProt entry the gene names or UniProt cross-references, and its
// structures.
async function namedEntry(
  gene: ResolvedGene,
  taxId: number,
  signal?: AbortSignal,
) {
  const entry = pickEntry(
    await fetchUniProtCandidates(gene, taxId, signal),
    gene.uniprotId,
  )
  const accession = gene.uniprotId ?? entry?.accession
  return { entry, accession, ...(await structureOf(accession, signal)) }
}

export async function fetchGeneStructure(
  symbol: string,
  taxId: number,
  signal?: AbortSignal,
): Promise<GeneStructure> {
  const gene = await resolveGene(symbol, taxId, signal)
  // UniProt and AlphaFold sit outside NCBI's throttle, so they run beside it.
  const [{ placement, tags, transcripts, target }, named] = await Promise.all([
    placedTranscripts(gene, signal),
    namedEntry(gene, taxId, signal),
  ])
  const isoforms = leadWithEntry(
    orderIsoforms(transcripts, tags, {
      refName: placement.refName,
      strand: placement.strand,
      geneName: gene.symbol,
    }),
    named.entry,
  )
  const picked = isoforms[0]
  if (!picked) {
    throw new Error(`No coding transcript in gene_table for ${symbol}`)
  }
  const proteinSequence = await fetchProteinSequence(picked.protein, signal)
  const uniprotId =
    named.accession ??
    (await uniProtForProtein(picked.protein, gene.symbol, taxId, signal))
  const { alphafold, canonical } = named.accession
    ? named
    : await structureOf(uniprotId, signal)
  return {
    symbol: gene.symbol,
    geneId: gene.geneId,
    taxId,
    organism: gene.organism,
    assemblyAccession: placement.assemblyAccession,
    target,
    uniprotId,
    proteinSequence,
    transcript: picked.transcript,
    canonical,
    alphafold,
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

// Expands each CDS by padding, merges overlaps, and emits one locstring per
// block; space-separated regions squeeze the introns out (the LGV has no
// collapseIntrons option). Flipping adds core's `[rev]` suffix and reverses the
// order, as CollapseIntronsDialog does for a minus-strand gene.
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
