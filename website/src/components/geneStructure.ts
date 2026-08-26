// Turns a gene into a connected JBrowse session: the gene on its genome with
// introns collapsed so the coding exons sit side by side, its AlphaFold 3D
// structure, and (on demand) an ortholog protein alignment. Everything is
// synthesized live — no per-gene data to host:
//
//  - NCBI Datasets : symbol + taxon -> GeneID, assembly, locus, strand,
//                    Swiss-Prot accession
//  - NCBI E-utils  : the `gene_table` flat file -> the canonical transcript's
//                    genomic exon/CDS structure (parsed here)
//  - a hosted config: the genome the session opens on, plus the name that config
//                    gives the gene's sequence and the gene track to draw under
//                    the exons — see genomeTarget.ts, which picks between the
//                    UCSC and GenArk configs and reads the chromAlias
//  - UniProt       : the Swiss-Prot accession when NCBI omits it (invertebrates,
//                    plants, fungi), so the AlphaFold 3D view still resolves
//
// The alignment is either built live in proteinMsa.ts (NCBI or PANTHER orthologs
// + EBI Clustal Omega) and carried inline, or named for the msaview plugin to
// read from the hosted 100-way file (hundredWay.ts).

import { deflate } from 'pako-esm2'

import { JBROWSE_BASE } from '../config/jbrowse.ts'
import { resolveGenomeTarget } from './genomeTarget.ts'
import { DATASETS, EUTILS, ncbiJson, ncbiText } from './ncbiFetch.ts'

import type { GenomeTarget } from './genomeTarget.ts'

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
  // as the source names it: an NCBI accession (NC_000077.7) off the gene_table,
  // or a UCSC name off the 100-way sidecar. buildSessionUrl renames it to
  // whatever the target config calls that sequence.
  refName: string
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
  // the genome this gene's session opens on, resolved from the accession
  target: GenomeTarget
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
  const proteinSequence = uniprotId
    ? await fetchUniProtSeq(uniprotId)
    : undefined
  const text = await ncbiText(
    `${EUTILS}/efetch.fcgi?db=gene&id=${gene.geneId}&rettype=gene_table&retmode=text`,
  )
  const picked = pickCanonical(
    parseGeneTableBlocks(text, placement.strand),
    proteinSequence?.length,
  )
  if (!picked) {
    throw new Error(`No coding transcript in gene_table for ${symbol}`)
  }
  return {
    symbol: gene.symbol,
    geneId: gene.geneId,
    taxId,
    assemblyAccession: placement.assemblyAccession,
    target,
    uniprotId,
    proteinSequence,
    transcript: {
      refName: placement.refName,
      strand: placement.strand,
      name: picked.mrna,
      geneName: gene.symbol,
      cds: picked.cds,
    },
  }
}

async function fetchUniProtSeq(uniprotId: string) {
  const res = await fetch(`${UNIPROT}/${uniprotId}.fasta`).catch(
    () => undefined,
  )
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

// An alignment carried in the session itself — small enough to ride in the URL,
// and the only way to ship the per-row domain overlay, which no hosted file has.
export interface InlineMsa {
  fasta: string
  newick: string
  gff?: string // per-row CDD domains, overlaid in react-msaview
  querySeqName: string
}

// An alignment the msaview plugin reads for itself at launch, named rather than
// carried: one block of an indexed bgzip file, keyed by gene name.
export interface IndexedMsa {
  msaUri: string
  treeUri: string
  msaName: string
  querySeqName: string
}

export interface SessionOptions {
  // carries its own target: which config the session opens on, what that config
  // calls the gene's sequence, and which gene track to draw under the exons.
  // Swap `transcript`/`proteinSequence` on the way in to launch the same gene
  // against a different coordinate source (see the 100-way path).
  structure: GeneStructure
  collapse?: boolean
  flip?: boolean
  inlineMsa?: InlineMsa
  // a hosted alignment the msaview plugin reads by name at launch, instead of
  // the inline one
  indexedMsa?: IndexedMsa
}

type Feature = ReturnType<typeof connectedFeature>

function linearGenomeView(
  transcript: Transcript,
  assembly: string,
  loc: LocOptions,
  tracks: string[],
) {
  return {
    id: `lgv-${transcript.geneName}`,
    type: 'LinearGenomeView',
    colorByCDS: true,
    init: { assembly, loc: collapsedLoc(transcript, loc), tracks },
  }
}

// Fields every MsaView carries regardless of where its alignment comes from.
// uniprotId is what MsaView.autoConnectStructures matches against the AlphaFold
// url's accession, which is how the alignment and the 3D view find each other.
function msaViewBase(
  transcript: Transcript,
  feature: Feature,
  uniprotId?: string,
) {
  return {
    id: `msa-${transcript.geneName}`,
    type: 'MsaView',
    connectedViewId: `lgv-${transcript.geneName}`,
    connectedFeature: feature,
    uniprotId,
    colorSchemeName: 'percent_identity_dynamic',
    labelsAlignRight: true,
    treeAreaWidth: 200,
  }
}

// The alignment we built here, carried in the session itself.
function msaViewInline(
  transcript: Transcript,
  feature: Feature,
  msa: InlineMsa,
  uniprotId?: string,
) {
  return {
    ...msaViewBase(transcript, feature, uniprotId),
    querySeqName: msa.querySeqName,
    data: { msa: msa.fasta, tree: msa.newick, gff: msa.gff },
  }
}

// The hosted 100-way: the session names the file and the gene, and the msaview
// plugin random-reads that block itself (the .gzi/.idx are found by suffix). The
// alignment stays out of the URL, which is what keeps a 100-row session small.
function msaViewIndexed(
  transcript: Transcript,
  feature: Feature,
  msa: IndexedMsa,
  uniprotId?: string,
) {
  return {
    ...msaViewBase(transcript, feature, uniprotId),
    treeFilehandle: { uri: msa.treeUri, locationType: 'UriLocation' },
    init: {
      msaIndexedLocation: { uri: msa.msaUri },
      msaName: msa.msaName,
      querySeqName: msa.querySeqName,
    },
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

// The workspace tree a session restores: a `row` branch of panels, each holding
// tabs of view ids, with sizes as weights (app-core's WorkspaceLayoutMixin).
// Genome + alignment stacked in the left cell, the 3D structure in the right.
// `useWorkspaces` turns the tiled layout on for this session without touching
// the reader's own preference.
//
// This is NOT the older session-level `init: {direction, children}` shape, which
// jbrowse-components dropped when the workspace became an MST tree — a session
// still emitting that one silently stacks its views in one column instead of
// tiling them, which is what this page did until the layout was ported over from
// react-msaview's gene explorer, where the regression was first caught.
// Ids only need to be unique within the tree; the ones jbrowse mints later are
// random, so fixed names cannot collide with them.
function sideBySideLayout(leftIds: string[], rightId: string) {
  return {
    useWorkspaces: true,
    activePanelId: 'panel-left',
    layout: {
      id: 'branch-root',
      direction: 'row' as const,
      size: 1,
      children: [
        {
          id: 'panel-left',
          size: 58,
          tabs: [{ id: 'tab-left', viewIds: leftIds }],
          activeTabId: 'tab-left',
        },
        {
          id: 'panel-right',
          size: 42,
          tabs: [{ id: 'tab-right', viewIds: [rightId] }],
          activeTabId: 'tab-right',
        },
      ],
    },
  }
}

// A connected genome + AlphaFold (+ optional alignment) session. The session
// rides in the URL hash (never sent to the server, so no request-line 414)
// deflated via toUrlSafeB64.
export function buildSessionUrl({
  structure,
  collapse = true,
  flip = false,
  inlineMsa,
  indexedMsa,
}: SessionOptions) {
  const { target, uniprotId, proteinSequence } = structure
  // The config's own name for the sequence, not NCBI's. Displayed-region
  // matching is exact and does not alias-resolve, so the connectedFeature and
  // the LGV's regions have to agree on the name or nothing highlights.
  const transcript = {
    ...structure.transcript,
    refName: target.canonicalRefName(structure.transcript.refName),
  }
  const feature = connectedFeature(transcript)
  const lgv = linearGenomeView(
    transcript,
    target.assemblyName,
    { collapse, flip },
    target.geneTrackId ? [target.geneTrackId] : [],
  )
  // One alignment at most: the hosted 100-way, else the one built here.
  const msa = indexedMsa
    ? msaViewIndexed(transcript, feature, indexedMsa, uniprotId)
    : inlineMsa
      ? msaViewInline(transcript, feature, inlineMsa, uniprotId)
      : undefined
  const protein =
    uniprotId && proteinSequence
      ? proteinView(transcript, feature, uniprotId, proteinSequence)
      : undefined

  const session = {
    name: `Gene explorer: ${transcript.geneName}`,
    views: [lgv, ...(msa ? [msa] : []), ...(protein ? [protein] : [])],
    ...(protein
      ? sideBySideLayout([lgv.id, ...(msa ? [msa.id] : [])], protein.id)
      : {}),
  }
  const url = `${JBROWSE_BASE}/#config=${encodeURIComponent(target.configUrl)}&session=encoded-${toUrlSafeB64(JSON.stringify(session))}`
  return { session, url }
}
