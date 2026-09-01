// The connected JBrowse session a gene launches: the gene on its genome with
// introns collapsed, one or more 3D structures, and (optionally) an ortholog
// alignment — three views sharing one transcript model, so a residue hovered in
// any of them lights its codon in the others.
//
// The session rides in the URL hash (never sent to the server, so no
// request-line 414) deflated via toUrlSafeB64.

import { deflate } from 'pako-esm2'

import { JBROWSE_BASE } from '../config/jbrowse.ts'
import {
  type GeneStructure,
  type LocOptions,
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

export type MsaSource =
  | { kind: 'inline'; msa: InlineMsa }
  | { kind: 'indexed'; msa: IndexedMsa }

// Where the primary structure comes from. `pdbId` is the protein3d plugin's
// shorthand for an RCSB entry, and naming the entry rather than a file is what
// lets the plugin fetch the SIFTS UniProt mapping for it.
export type StructureSource = { url: string } | { pdbId: string }

// A 0-based half-open range of structure residues, lit on load across all
// three views as if it had been clicked — how a domain in the cartoon becomes
// the thing the session opens on.
export interface ResidueRange {
  start: number
  end: number
}

export interface SessionOptions {
  // carries its own target: which config the session opens on, what that config
  // calls the gene's sequence, and which gene track to draw under the exons.
  // Swap `transcript`/`proteinSequence` on the way in to launch the same gene
  // against a different coordinate source (see the 100-way path).
  structure: GeneStructure
  primary?: StructureSource
  // further structures, superposed on the primary by the plugin (TM-align)
  superposed?: StructureSource[]
  initialSelection?: ResidueRange
  collapse?: boolean
  flip?: boolean
  msa?: MsaSource
  variantTracks?: boolean
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
// The ProteinView and the MsaView find each other by naming the same connected
// genome view; uniprotId is what the msaview plugin additionally matches
// against an AlphaFold url when it has one.
function msaView(
  transcript: Transcript,
  feature: Feature,
  source: MsaSource,
  uniprotId?: string,
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
  return source.kind === 'inline'
    ? {
        ...base,
        querySeqName: source.msa.querySeqName,
        data: {
          msa: source.msa.fasta,
          tree: source.msa.newick,
          gff: source.msa.gff,
        },
      }
    : // The hosted 100-way: the session names the file and the gene, and the
      // msaview plugin random-reads that block itself (the .gzi/.idx are found
      // by suffix). The alignment stays out of the URL, which is what keeps a
      // 100-row session small.
      {
        ...base,
        treeFilehandle: {
          uri: source.msa.treeUri,
          locationType: 'UriLocation',
        },
        init: {
          msaIndexedLocation: { uri: source.msa.msaUri },
          msaName: source.msa.msaName,
          querySeqName: source.msa.querySeqName,
        },
      }
}

// Every field maps onto a Structure model property in the protein3d plugin, so
// this is exactly the snapshot MST hydrates; there is no `init` channel.
function proteinView(
  transcript: Transcript,
  feature: Feature,
  primary: StructureSource,
  proteinSequence: string,
  superposed: StructureSource[],
  initialSelection?: ResidueRange,
) {
  return {
    id: `protein-${transcript.geneName}`,
    type: 'ProteinView',
    height: 500,
    zoomToBaseLevel: false,
    structures: [
      {
        ...primary,
        feature,
        userProvidedTranscriptSequence: proteinSequence,
        connectedViewId: `lgv-${transcript.geneName}`,
        ...(initialSelection ? { initialSelection } : {}),
      },
      ...superposed,
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
// tiling them. Ids only need to be unique within the tree; the ones jbrowse
// mints later are random, so fixed names cannot collide with them.
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

export function buildSessionUrl({
  structure,
  primary,
  superposed = [],
  initialSelection,
  collapse = true,
  flip = false,
  msa,
  variantTracks = true,
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
    [
      ...(target.geneTrackId ? [target.geneTrackId] : []),
      ...(variantTracks ? target.variantTrackIds : []),
    ],
  )
  const alignment = msa
    ? msaView(transcript, feature, msa, uniprotId)
    : undefined
  const protein =
    primary && proteinSequence
      ? proteinView(
          transcript,
          feature,
          primary,
          proteinSequence,
          superposed,
          initialSelection,
        )
      : undefined

  const session = {
    name: `Gene explorer: ${transcript.geneName}`,
    views: [
      lgv,
      ...(alignment ? [alignment] : []),
      ...(protein ? [protein] : []),
    ],
    ...(protein
      ? sideBySideLayout(
          [lgv.id, ...(alignment ? [alignment.id] : [])],
          protein.id,
        )
      : {}),
  }
  const url = `${JBROWSE_BASE}/#config=${encodeURIComponent(target.configUrl)}&session=encoded-${toUrlSafeB64(JSON.stringify(session))}`
  return { session, url }
}
