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
//                    transcript's protein sequence
//  - a hosted config: the genome the session opens on, plus the name that config
//                    gives the gene's sequence and the gene track to draw under
//                    the exons — see genomeTarget.ts
//  - UniProt       : the Swiss-Prot accession when NCBI omits it (invertebrates,
//                    plants, fungi), so the structure lookups still resolve
//  - AlphaFold DB  : the prediction API, which says which models exist for the
//                    accession rather than assuming the canonical F1 file does
//
// The session itself is built in proteinSession.ts.

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

export type TranscriptTag = 'MANE Select' | 'RefSeq Select'

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
  // every AlphaFold model the accession has, in the API's order
  alphafold: AlphaFoldModel[]
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
// NCBI annotates several assemblies per species and leads with the newest, which
// is routinely one nothing here hosts yet: as of 2026-08-26 it places zebrafish
// genes on GCF_052040795.1, which has no GenArk hub and no entry in the assembly
// index, while GRCz11 beside it has both. Taking annotations[0] therefore
// stranded a whole species. The caller walks these in order and keeps the first
// it can open.
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
): Promise<ResolvedGene> {
  const json = await ncbiJson<DatasetsGeneReport>(
    `${DATASETS}/gene/symbol/${encodeURIComponent(symbol)}/taxon/${taxId}`,
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

// Reviewed (Swiss-Prot) accession for a gene, when NCBI's Datasets record omits
// it. Best-effort: a failure just means no 3D structure. `gene_exact` rather
// than `gene`, which also matches synonyms and would hand back a paralog.
export async function fetchUniProtAccession(
  symbol: string,
  taxId: number,
): Promise<string | undefined> {
  const query = encodeURIComponent(
    `gene_exact:${symbol} AND organism_id:${taxId} AND reviewed:true`,
  )
  const res = await fetch(
    `${UNIPROT}/search?query=${query}&fields=accession&format=json&size=1`,
  ).catch(() => undefined)
  const json: unknown = res?.ok ? await res.json() : undefined
  const results =
    typeof json === 'object' && json !== null && 'results' in json
      ? (json as { results: unknown[] }).results
      : []
  const first = results[0]
  return typeof first === 'object' &&
    first !== null &&
    'primaryAccession' in first &&
    typeof first.primaryAccession === 'string'
    ? first.primaryAccession
    : undefined
}

// --- gene_table parsing ------------------------------------------------------
// `efetch db=gene rettype=gene_table` lists, per transcript, an exon table whose
// "Genomic Interval Coding" column gives each CDS exon's genomic coordinates
// (1-based inclusive) — all the collapsed-intron view needs.

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

export interface ParsedTranscript {
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
// Select exists for human alone; RefSeq Select covers the other annotated
// species. Best-effort: with no flags the pick falls back to the longest
// curated isoform, which is what it always was.
export async function fetchSelectTranscripts(
  geneId: string,
): Promise<Map<string, TranscriptTag>> {
  const json = await ncbiJson<{
    reports?: {
      product?: {
        transcripts?: { accession_version?: string; select_category?: string }[]
      }
    }[]
  }>(`${DATASETS}/gene/id/${geneId}/product_report`).catch(() => undefined)
  const tags = new Map<string, TranscriptTag>()
  for (const t of json?.reports?.[0]?.product?.transcripts ?? []) {
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
export async function fetchProteinSequence(accession: string) {
  const text = await ncbiText(
    `${EUTILS}/efetch.fcgi?db=protein&id=${accession}&rettype=fasta&retmode=text`,
  )
  const [, ...seq] = text.trim().split('\n')
  return seq.join('')
}

// --- assembling a GeneStructure ----------------------------------------------

// The first of the gene's placements whose genome we can actually open, with the
// coordinates NCBI reported against THAT assembly — a fallback that kept the
// locus from the newest annotation would be a locus in the wrong coordinate
// space.
async function firstHostedPlacement(
  symbol: string,
  placements: PlacedAnnotation[],
) {
  for (const placement of placements) {
    const target = await resolveGenomeTarget(placement.assemblyAccession).catch(
      () => undefined,
    )
    if (target) {
      return { placement, target }
    }
  }
  throw new Error(
    `No hosted genome for "${symbol}": NCBI places it on ${placements
      .map(p => p.assemblyAccession)
      .join(', ')}, none of which this site serves`,
  )
}

export async function fetchGeneStructure(
  symbol: string,
  taxId: number,
): Promise<GeneStructure> {
  const gene = await resolveGene(symbol, taxId)
  const { placement, target } = await firstHostedPlacement(
    symbol,
    gene.placements,
  )
  const uniprotId =
    gene.uniprotId ?? (await fetchUniProtAccession(symbol, taxId))
  // Neither of these is an NCBI call, so they overlap the throttled ones below.
  const alphafoldPending = uniprotId
    ? fetchAlphaFoldModels(uniprotId)
    : Promise.resolve([])
  const tags = await fetchSelectTranscripts(gene.geneId)
  const text = await ncbiText(
    `${EUTILS}/efetch.fcgi?db=gene&id=${gene.geneId}&rettype=gene_table&retmode=text`,
  )
  const isoforms = orderIsoforms(
    parseGeneTableBlocks(text, placement.strand),
    tags,
    {
      refName: placement.refName,
      strand: placement.strand,
      geneName: gene.symbol,
    },
  )
  const picked = isoforms[0]
  if (!picked) {
    throw new Error(`No coding transcript in gene_table for ${symbol}`)
  }
  const proteinSequence = await fetchProteinSequence(picked.protein).catch(
    () => undefined,
  )
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
    alphafold: await alphafoldPending,
  }
}

// --- collapsed-intron geometry -----------------------------------------------

export const DEFAULT_PADDING = 40

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

export interface GeneStats {
  codingBp: number
  span: number
  ratio: string
}

export function geneStats(transcript: Transcript): GeneStats {
  const codingBp = transcript.cds.reduce((n, c) => n + (c.end - c.start), 0)
  const { start, end } = blockBounds(transcript.cds)
  const span = end - start
  return { codingBp, span, ratio: (span / codingBp).toFixed(1) }
}
