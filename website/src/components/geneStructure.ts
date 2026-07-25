// Turns a gene into a connected JBrowse session: the gene on its genome with
// introns collapsed so the coding exons sit side by side, its AlphaFold 3D
// structure, and (on demand) an ortholog protein alignment. Everything is
// synthesized live — no per-gene data to host:
//
//  - NCBI Datasets : symbol + taxon -> GeneID, assembly, locus, strand,
//                    Swiss-Prot accession
//  - NCBI E-utils  : the `gene_table` flat file -> the canonical transcript's
//                    genomic exon/CDS structure (parsed here)
//  - UCSC GenArk   : the assembly, pulled in via the merge API by accession, so
//                    the LinearGenomeView has a genome without a config change
//  - UniProt       : the Swiss-Prot accession when NCBI omits it (invertebrates,
//                    plants, fungi), so the AlphaFold 3D view still resolves
//
// The alignment, when built, comes from proteinMsa.ts (NCBI orthologs + EBI
// Clustal Omega) and rides inline in the session.

import { deflate } from 'pako-esm2'

import { mergeConfig } from './jbrowseLinks.ts'
import { DATASETS, EUTILS, ncbiJson, ncbiText } from './ncbiFetch.ts'
import { JBROWSE_BASE } from '../config/jbrowse.ts'

// This view needs a build that bundles the msaview + protein3d plugins and reads
// params from the URL hash — true of `main` since webgl-poc merged. It is why
// /protein-browser stays staging-gated (config/features.ts), where JBROWSE_BASE
// resolves to `main`.
const UNIPROT = 'https://rest.uniprot.org/uniprotkb'

export interface Exon {
  start: number // 0-based interbase
  end: number
}
export interface CDS extends Exon {
  phase: number
}
export interface Transcript {
  refName: string // e.g. NC_000077.7 — matches the GenArk assembly's seq names
  strand: 1 | -1
  name: string // RefSeq mRNA accession
  geneName: string
  cds: CDS[] // genomic ascending, coding only
}

export interface GeneStructure {
  symbol: string
  geneId: string
  taxId: number
  assemblyAccession: string
  transcript: Transcript
  uniprotId?: string
  // UniProt canonical sequence — what AlphaFold aligns to, and the isoform the
  // transcript pick is matched against
  proteinSequence?: string
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

function pickAnnotation(
  gene: NonNullable<DatasetsGeneReport['reports']>[number]['gene'],
) {
  return gene?.annotations
    ?.map(a => ({
      a,
      loc: a.genomic_locations?.find(l => l.genomic_range?.begin),
    }))
    .find(({ loc }) => loc)
}

interface ResolvedGene {
  symbol: string
  geneId: string
  assemblyAccession: string
  refName: string
  strand: 1 | -1
  uniprotId?: string
}

// Gene symbol + taxon -> GeneID, assembly, refName, strand, Swiss-Prot. The
// coordinates are relative to the annotation NCBI reports, which is the same
// coordinate space the GenArk 2bit uses.
export async function resolveGene(
  symbol: string,
  taxId: number,
): Promise<ResolvedGene> {
  const json = await ncbiJson<DatasetsGeneReport>(
    `${DATASETS}/gene/symbol/${encodeURIComponent(symbol)}/taxon/${taxId}`,
  )
  const gene = json.reports?.[0]?.gene
  const hit = pickAnnotation(gene)
  if (!gene?.gene_id || !hit?.loc?.genomic_range?.begin) {
    throw new Error(`No placed locus for "${symbol}" in taxon ${taxId}`)
  }
  return {
    symbol: gene.symbol ?? symbol,
    geneId: gene.gene_id,
    assemblyAccession: hit.a.assembly_accession ?? '',
    refName: hit.loc.genomic_accession_version ?? '',
    strand: hit.loc.genomic_range.orientation === 'minus' ? -1 : 1,
    uniprotId: gene.swiss_prot_accessions?.[0],
  }
}

// Reviewed (Swiss-Prot) accession for a gene, when NCBI's Datasets record omits
// it. Best-effort: a failure just means no 3D structure.
export async function fetchUniProtAccession(
  symbol: string,
  taxId: number,
): Promise<string | undefined> {
  const query = encodeURIComponent(
    `gene:${symbol} AND organism_id:${taxId} AND reviewed:true`,
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

interface ParsedTranscript {
  mrna: string
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
    if (mrna) {
      const coding = block
        .split('\n')
        .filter(l => /^\d+-\d+/.test(l.trim()))
        .map(codingFromRow)
        .filter((c): c is { start: number; end: number } => !!c)
        .map(c => ({ start: c.start - 1, end: c.end }))
        .sort((a, b) => a.start - b.start)
      if (coding.length > 0) {
        const aaLength = Math.round(
          coding.reduce((n, c) => n + (c.end - c.start), 0) / 3,
        )
        out.push({ mrna, aaLength, cds: assignPhases(coding, strand) })
      }
    }
  }
  return out
}

// Prefer curated RefSeq (NM_/NR_) over predicted (XM_/XR_), then the isoform
// matching the UniProt canonical length (best for the 3D view), else the longest.
function pickCanonical(
  transcripts: ParsedTranscript[],
  uniprotLength: number | undefined,
) {
  const curated = transcripts.filter(t => /^N[MR]_/.test(t.mrna))
  const pool = curated.length > 0 ? curated : transcripts
  const matched =
    uniprotLength === undefined
      ? undefined
      : pool.find(t => t.aaLength === uniprotLength)
  return matched ?? [...pool].sort((a, b) => b.aaLength - a.aaLength).at(0)
}

// --- assembling a GeneStructure ----------------------------------------------

export async function fetchGeneStructure(
  symbol: string,
  taxId: number,
): Promise<GeneStructure> {
  const gene = await resolveGene(symbol, taxId)
  const uniprotId =
    gene.uniprotId ?? (await fetchUniProtAccession(symbol, taxId))
  const proteinSequence = uniprotId
    ? await fetchUniProtSeq(uniprotId)
    : undefined
  const text = await ncbiText(
    `${EUTILS}/efetch.fcgi?db=gene&id=${gene.geneId}&rettype=gene_table&retmode=text`,
  )
  const picked = pickCanonical(
    parseGeneTableBlocks(text, gene.strand),
    proteinSequence?.length,
  )
  if (!picked) {
    throw new Error(`No coding transcript in gene_table for ${symbol}`)
  }
  return {
    symbol: gene.symbol,
    geneId: gene.geneId,
    taxId,
    assemblyAccession: gene.assemblyAccession,
    uniprotId,
    proteinSequence,
    transcript: {
      refName: gene.refName,
      strand: gene.strand,
      name: picked.mrna,
      geneName: gene.symbol,
      cds: picked.cds,
    },
  }
}

async function fetchUniProtSeq(uniprotId: string) {
  const res = await fetch(`${UNIPROT}/${uniprotId}.fasta`).catch(() => undefined)
  if (!res?.ok) {
    return undefined
  }
  const [, ...seq] = (await res.text()).trim().split('\n')
  return seq.join('')
}

// --- collapsed-intron geometry -----------------------------------------------

export const DEFAULT_PADDING = 40

function blockBounds(blocks: Exon[]) {
  return {
    start: Math.min(...blocks.map(b => b.start)),
    end: Math.max(...blocks.map(b => b.end)),
  }
}

// Expand each CDS by padding, merge overlaps, then emit one locstring per merged
// block. Giving the LGV these as space-separated regions squeezes the introns
// out (there is no collapseIntrons option — this IS how it's done declaratively).
export function collapsedLoc(
  transcript: Transcript,
  collapse: boolean,
  padding = DEFAULT_PADDING,
) {
  const { refName, cds } = transcript
  if (!collapse) {
    const { start, end } = blockBounds(cds)
    return `${refName}:${start + 1}-${end}`
  }
  const merged: Exon[] = []
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
  return merged.map(e => `${refName}:${e.start + 1}-${e.end}`).join(' ')
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

// The transcript model the MsaView + ProteinView map a residue to its codon
// through. 0-based interbase, CDS subfeatures only.
function connectedFeature(transcript: Transcript) {
  const { start, end } = blockBounds(transcript.cds)
  return {
    uniqueId: transcript.name,
    type: 'mRNA',
    refName: transcript.refName,
    start,
    end,
    strand: transcript.strand,
    name: transcript.name,
    subfeatures: transcript.cds.map(c => ({
      type: 'CDS',
      start: c.start,
      end: c.end,
      strand: transcript.strand,
      phase: c.phase,
    })),
  }
}

// --- session URL -------------------------------------------------------------

const alphafoldCif = (uniprotId: string) =>
  `https://alphafold.ebi.ac.uk/files/AF-${uniprotId}-F1-model_v6.cif`

// Mirrors @jbrowse/core's toUrlSafeB64 (deflate + url-safe unpadded base64) so
// jbrowse-web's `encoded-` loader inflates it back.
function toUrlSafeB64(str: string) {
  const deflated: Uint8Array = deflate(new TextEncoder().encode(str), undefined)
  const b64 = btoa(Array.from(deflated, b => String.fromCharCode(b)).join(''))
  return b64.replace(/=+$/, '').replaceAll('+', '-').replaceAll('/', '_')
}

export interface InlineMsa {
  fasta: string
  newick: string
  gff?: string // per-row CDD domains, overlaid in react-msaview
  querySeqName: string
}

export interface SessionOptions {
  structure: GeneStructure
  collapse?: boolean
  inlineMsa?: InlineMsa
}

type Feature = ReturnType<typeof connectedFeature>

function linearGenomeView(transcript: Transcript, assembly: string, collapse: boolean) {
  return {
    id: `lgv-${transcript.geneName}`,
    type: 'LinearGenomeView',
    colorByCDS: true,
    init: { assembly, loc: collapsedLoc(transcript, collapse), tracks: [] },
  }
}

function msaView(transcript: Transcript, feature: Feature, msa: InlineMsa, uniprotId?: string) {
  return {
    id: `msa-${transcript.geneName}`,
    type: 'MsaView',
    connectedViewId: `lgv-${transcript.geneName}`,
    connectedFeature: feature,
    uniprotId,
    colorSchemeName: 'percent_identity_dynamic',
    labelsAlignRight: true,
    treeAreaWidth: 200,
    querySeqName: msa.querySeqName,
    data: { msa: msa.fasta, tree: msa.newick, gff: msa.gff },
  }
}

function proteinView(
  transcript: Transcript,
  feature: Feature,
  uniprotId: string,
  proteinSequence: string,
) {
  return {
    id: `protein-${transcript.geneName}`,
    type: 'ProteinView',
    height: 500,
    zoomToBaseLevel: false,
    structures: [
      {
        url: alphafoldCif(uniprotId),
        feature,
        userProvidedTranscriptSequence: proteinSequence,
        connectedViewId: `lgv-${transcript.geneName}`,
      },
    ],
  }
}

function sideBySideLayout(leftIds: string[], rightId: string) {
  return {
    direction: 'horizontal' as const,
    children: [
      { viewIds: leftIds, size: 58 },
      { viewIds: [rightId], size: 42 },
    ],
  }
}

// A connected genome + AlphaFold (+ optional alignment) session. The assembly
// comes from the merge API by accession; the session rides in the URL hash
// (never sent to the server, so no request-line 414) deflated via toUrlSafeB64.
export function buildSessionUrl({
  structure,
  collapse = true,
  inlineMsa,
}: SessionOptions) {
  const { transcript, assemblyAccession, uniprotId, proteinSequence } = structure
  const feature = connectedFeature(transcript)
  const lgv = linearGenomeView(transcript, assemblyAccession, collapse)
  const msa = inlineMsa
    ? msaView(transcript, feature, inlineMsa, uniprotId)
    : undefined
  const protein =
    uniprotId && proteinSequence
      ? proteinView(transcript, feature, uniprotId, proteinSequence)
      : undefined

  const session = {
    name: `Gene explorer: ${transcript.geneName}`,
    views: [lgv, ...(msa ? [msa] : []), ...(protein ? [protein] : [])],
    ...(protein
      ? { init: sideBySideLayout([lgv.id, ...(msa ? [msa.id] : [])], protein.id) }
      : {}),
  }
  const config = mergeConfig([assemblyAccession])
  const url = `${JBROWSE_BASE}/#config=${encodeURIComponent(config)}&session=encoded-${toUrlSafeB64(JSON.stringify(session))}`
  return { session, url }
}
