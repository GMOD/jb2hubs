// The connected JBrowse session a gene launches: the gene on its genome with
// introns collapsed, one or more 3D structures, and (optionally) an ortholog
// alignment — three views sharing one transcript model, so a residue hovered in
// any of them lights its codon in the others.
//
// The session rides in the URL hash, deflated via toUrlSafeB64: a hash never
// leaves the browser, so no request line limits it.

import { deflate } from 'pako-esm2'

import { JBROWSE_BASE } from '../config/jbrowse.ts'
import {
  type GeneStructure,
  type Transcript,
  blockBounds,
  collapsedLoc,
} from './geneStructure.ts'

// Mirrors @jbrowse/core's toUrlSafeB64 (deflate + url-safe unpadded base64) so
// jbrowse-web's `encoded-` loader inflates it back.
function toUrlSafeB64(str: string) {
  const deflated: Uint8Array = deflate(new TextEncoder().encode(str), undefined)
  const b64 = btoa(Array.from(deflated, b => String.fromCharCode(b)).join(''))
  return b64.replace(/=+$/, '').replaceAll('+', '-').replaceAll('/', '_')
}

// A labelled range react-msaview draws over the alignment: `row` + start/end
// are that row's residues, 1-based inclusive; without a row they are columns.
export interface MsaHighlight {
  row?: string
  start: number
  end: number
  label?: string
  color?: string
}

// An alignment carried in the session itself, the only way to ship the per-row
// domain overlay, which no hosted file has.
interface InlineMsa {
  fasta: string
  newick?: string
  gff?: string // per-row domains, overlaid in react-msaview
  querySeqName: string
  highlights?: MsaHighlight[]
  // where the view opens, on the query row's residues; react-msaview zooms
  // onto it and scrolls the row to the middle
  region?: { row: string; start: number; end: number }
  // when the query row is one segment of the translation rather than all of
  // it — a Pfam seed row is a domain — the residues (1-based inclusive) it
  // covers, so the view counts the row's residues from where the segment starts
  residueRange?: { start: number; end: number }
}

// An alignment the msaview plugin BUILDS when the session opens, from a request
// the session carries rather than rows: NCBI's ortholog set (`ncbi`) or the
// query's UniRef cluster across UniProtKB's reference proteomes (`uniref`),
// aligned in the browser, no job anywhere. It takes the launched transcript's
// translation as the query row, added by msaView so the rows share the genome
// view's codons. See jbrowse-plugin-msaview's docs/launch-parameters.md for
// every field.
export interface BuiltMsa {
  orthologParams: {
    taxId: number
    geneCandidates: string[]
    source: 'ncbi' | 'uniref'
    identity?: 50 | 90
    msaAlgorithm: 'browser'
    maxSpecies?: number
  }
}

export type MsaSource =
  | { kind: 'inline'; msa: InlineMsa }
  | { kind: 'built'; msa: BuiltMsa }

// Where the primary structure comes from. `pdbId` is the protein3d plugin's
// shorthand for an RCSB entry, and naming the entry rather than a file is what
// lets the plugin fetch the SIFTS UniProt mapping for it. `uniprotId` names the
// AlphaFold entry, and the plugin asks AlphaFold's API for the model folded from
// the launched translation, the same pick the card makes, so a link outlives
// the model version a file url spells (`_v4` already 404s).
export type StructureSource =
  | { url: string }
  | { pdbId: string }
  | { uniprotId: string }

// Residues of the launched translation, 1-based inclusive, lit on load across
// all three views as if they had been clicked — how a domain on the map becomes
// the thing the session opens on. The plugin carries them onto whichever
// structure opens through its own alignment, so one numbering serves an
// AlphaFold model, a crystal numbered from the mature protein, and a complex.
export interface ResidueRange {
  start: number
  end: number
}

export interface SessionOptions {
  // carries its own target: which config the session opens on, what that config
  // calls the gene's sequence, and which gene track to draw under the exons.
  // Swap `transcript`/`proteinSequence` on the way in to launch the same gene
  // against a different coordinate source (see a seed's structureOverrides).
  structure: GeneStructure
  primary?: StructureSource
  initialTranscriptResidues?: readonly ResidueRange[]
  msa?: MsaSource
  // The structure view's pairwise alignment panel. Off when the structure was
  // folded from the launched translation — an identity alignment is a wall of
  // matches with nothing to read — and on when the panel is what says which
  // residues a crystal or another isoform is missing.
  showAlignment?: boolean
  // The structure's color, unset for the plugin's own chain and element
  // colors. See `STRUCTURE_COLORS`.
  colorScheme?: StructureColor
}

// The protein3d color schemes a session can name, as the plugin names them.
// `plddt-confidence` reads a predicted model's own confidence, so a residue
// AlphaFold could not place reads as such (BRAF V600 sits at 49);
// `alphamissense` puts AlphaFold DB's per-residue pathogenicity for the UniProt
// entry on any structure of it, through SIFTS for a PDB entry; `clinvar`
// counts the pathogenic missense calls in NCBI's ClinVar VCF on the launched
// transcript's codons, and reaches the structure through the transcript. The
// last two need protein3d 1.6.0, and a session naming one fails on an older
// plugin; ClinVar from NCBI arrived in 1.6.1.
export const STRUCTURE_COLORS = [
  'plddt-confidence',
  'alphamissense',
  'clinvar',
] as const

export type StructureColor = (typeof STRUCTURE_COLORS)[number]

export const HUMAN = 9606

export type ColorChoice = StructureColor | 'default'

export const COLOR_LABELS: Record<ColorChoice, string> = {
  default: 'Chain and element',
  'plddt-confidence': 'AlphaFold confidence (pLDDT)',
  alphamissense: 'AlphaMissense pathogenicity',
  clinvar: 'ClinVar pathogenic variants',
}

// pLDDT is a predicted model's own; AlphaMissense and ClinVar cover the human
// proteome only, and AlphaMissense numbers the UniProt entry, so it paints the
// canonical model and a PDB entry (through SIFTS) and leaves an isoform model
// grey (PAX6 opens AF-P26367-2-F1).
export function colorsFor({
  predicted,
  isoformModel,
  taxId,
}: {
  predicted: boolean
  isoformModel: boolean
  taxId: number
}): ColorChoice[] {
  return [
    'default',
    ...STRUCTURE_COLORS.filter(c =>
      c === 'plddt-confidence'
        ? predicted
        : c === 'alphamissense'
          ? taxId === HUMAN && !(predicted && isoformModel)
          : taxId === HUMAN,
    ),
  ]
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

type Feature = ReturnType<typeof connectedFeature>

// The coding exons back to back, a minus-strand gene read 5'->3', and less
// on screen than a default genome view: no overview bar, no gridlines.
function linearGenomeView(
  transcript: Transcript,
  assembly: string,
  tracks: string[],
) {
  const loc = collapsedLoc(transcript, { flip: transcript.strand === -1 })
  return {
    id: `lgv-${transcript.geneName}`,
    type: 'LinearGenomeView',
    colorByCDS: true,
    hideHeaderOverview: true,
    showGridlines: false,
    init: { assembly, loc, tracks },
  }
}

// Fields every MsaView carries regardless of where its alignment comes from.
// The ProteinView and the MsaView find each other by naming the same connected
// genome view; uniprotId is what the msaview plugin additionally matches
// against an AlphaFold url when it has one.
function msaView(
  transcript: Transcript,
  feature: Feature,
  source: MsaSource,
  uniprotId?: string,
  proteinSequence?: string,
) {
  const base = {
    id: `msa-${transcript.geneName}`,
    type: 'MsaView',
    connectedViewId: `lgv-${transcript.geneName}`,
    connectedFeature: feature,
    uniprotId,
    colorSchemeName: 'percent_identity_dynamic',
    labelsAlignRight: true,
    treeAreaWidth: 200,
  }
  switch (source.kind) {
    case 'inline': {
      const { residueRange, highlights, region } = source.msa
      return {
        ...base,
        // A query row that is one segment of the translation says how many
        // residues precede it, and the plugin maps the row through the whole
        // transcript from there. Residues outside the row map to nothing.
        ...(residueRange ? { querySeqOffset: residueRange.start - 1 } : {}),
        ...(highlights?.length ? { highlights } : {}),
        ...(region ? { region } : {}),
        querySeqName: source.msa.querySeqName,
        data: {
          msa: source.msa.fasta,
          ...(source.msa.newick ? { tree: source.msa.newick } : {}),
          gff: source.msa.gff,
        },
      }
    }
    case 'built': {
      const query = proteinSequence ? { proteinSequence } : {}
      return {
        ...base,
        allowedGappyness: 50,
        orthologParams: { ...source.msa.orthologParams, ...query },
      }
    }
  }
}

export const PDB_ID = /^\d\w{3}$/

// Which structure a launch opens, by precedence: the reader's or the link's
// pick where it can be honoured (`none`, `alphafold` with a model, a PDB id);
// the complex a focused partner or ligand was seen in; the entry a focused
// residue is seen touching something in; the AlphaFold model. Past those,
// `chosen` is unset and `needsList` says the experimental entries decide.
export function chooseStructure({
  pick,
  complexId,
  residueEntry,
  hasModel,
}: {
  pick?: string
  complexId?: string
  residueEntry?: string
  hasModel: boolean
}) {
  const picked =
    pick === 'none' ||
    (pick === 'alphafold' && hasModel) ||
    (pick && PDB_ID.test(pick))
      ? pick
      : undefined
  const chosen =
    picked ?? complexId ?? residueEntry ?? (hasModel ? 'alphafold' : undefined)
  return { needsList: chosen === undefined, chosen }
}

// What a view id calls its structure, so two ProteinViews of one gene (an
// isoform beside the canonical, two entries side by side) never share an id.
export function structureKey(source: StructureSource) {
  if ('pdbId' in source) {
    return source.pdbId.toLowerCase()
  }
  if ('uniprotId' in source) {
    return source.uniprotId
  }
  return (
    source.url
      .split('/')
      .pop()
      ?.replace(/\.\w+$/, '') || 'url'
  )
}

// Every field maps onto a Structure model property in the protein3d plugin, so
// this is exactly the snapshot MST hydrates; there is no `init` channel.
function proteinView(
  transcript: Transcript,
  feature: Feature,
  primary: StructureSource,
  proteinSequence: string,
  {
    initialTranscriptResidues,
    showAlignment,
    colorScheme,
  }: Pick<
    SessionOptions,
    'initialTranscriptResidues' | 'showAlignment' | 'colorScheme'
  >,
) {
  return {
    id: `protein-${transcript.geneName}-${structureKey(primary)}`,
    type: 'ProteinView',
    height: 500,
    zoomToBaseLevel: false,
    ...(showAlignment === false ? { showAlignment: false } : {}),
    ...(colorScheme ? { colorScheme } : {}),
    structures: [
      {
        ...primary,
        feature,
        userProvidedTranscriptSequence: proteinSequence,
        connectedViewId: `lgv-${transcript.geneName}`,
        ...(initialTranscriptResidues?.length
          ? { initialTranscriptResidues }
          : {}),
      },
    ],
  }
}

// The workspace tree a session restores: a `row` branch of panels, each holding
// tabs of view ids, with sizes as weights (app-core's WorkspaceLayoutMixin).
// Genome + alignment stacked in the left cell, the 3D structure in the right.
// `useWorkspaces` turns the tiled layout on for this session — on a host that
// reads the tree, without touching the reader's own preference.
//
// This is NOT the older session-level `init: {direction, children}` shape, which
// jbrowse-components dropped when the workspace became an MST tree — a session
// still emitting that one silently stacks its views in one column instead of
// tiling them. Ids only need to be unique within the tree; the ones jbrowse
// mints later are random, so fixed names cannot collide with them.
export function sideBySideLayout(leftIds: string[], rightId: string) {
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

export function buildSessionUrl({
  structure,
  primary,
  initialTranscriptResidues,
  msa,
  showAlignment = true,
  colorScheme,
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
  const lgv = linearGenomeView(transcript, target.assemblyName, [
    ...(target.geneTrackId ? [target.geneTrackId] : []),
    ...target.variantTrackIds,
  ])
  const alignment = msa
    ? msaView(transcript, feature, msa, uniprotId, proteinSequence)
    : undefined
  const protein =
    primary && proteinSequence
      ? proteinView(transcript, feature, primary, proteinSequence, {
          initialTranscriptResidues,
          showAlignment,
          colorScheme,
        })
      : undefined

  const carried = alignment ? [alignment] : []
  const session = {
    name: `Gene explorer: ${transcript.geneName}`,
    views: [lgv, ...carried, ...(protein ? [protein] : [])],
    ...(protein
      ? sideBySideLayout([lgv.id, ...carried.map(v => v.id)], protein.id)
      : {}),
  }
  // share.jbrowse.org's share-<id> route carried BRAF's 24,794-byte seed
  // session in 1.9 s (2026-09-12); the hash carries it with no POST or stored
  // copy, so share links are the fallback only if a release stops reading it.
  const url = `${JBROWSE_BASE}/#config=${encodeURIComponent(target.configUrl)}&session=encoded-${toUrlSafeB64(JSON.stringify(session))}`
  return { session, url, loc: lgv.init.loc }
}
