// The connected JBrowse session a gene launches: the gene on its genome with
// introns collapsed, one or more 3D structures, and (optionally) an ortholog
// alignment — three views sharing one transcript model, so a residue hovered in
// any of them lights its codon in the others.
//
// The session rides in the URL, deflated via toUrlSafeB64 — in the hash where
// the host reads it (never sent to the server, so no request-line limit), else
// in the query string under QUERY_URL_BUDGET.

import { deflate } from 'pako-esm2'

import {
  HOST_HAS_WORKSPACE_LAYOUT,
  HOST_READS_HASH_PARAMS,
  JBROWSE_BASE,
  onGeneTrackHost,
} from '../config/jbrowse.ts'
import {
  type GeneStructure,
  type LocOptions,
  type Transcript,
  blockBounds,
  collapsedLoc,
  sliceCds,
} from './geneStructure.ts'
import { isNcbiGffTrack } from './genomeTarget.ts'

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

// An alignment carried in the session itself — small enough to ride in the URL,
// and the only way to ship the per-row domain overlay, which no hosted file has.
interface InlineMsa {
  fasta: string
  newick?: string
  gff?: string // per-row domains, overlaid in react-msaview
  querySeqName: string
  highlights?: MsaHighlight[]
  // when the query row is one segment of the translation rather than all of
  // it — a Pfam seed row is a domain — the residues (1-based inclusive) it
  // covers, so the view's connected transcript is cut to those codons
  residueRange?: { start: number; end: number }
}

// An alignment the msaview plugin reads for itself at launch, named rather than
// carried: one block of an indexed bgzip file, keyed by gene name.
interface IndexedMsa {
  msaUri: string
  treeUri: string
  msaName: string
  querySeqName: string
}

// An alignment the msaview plugin BUILDS when the session opens, from a request
// the session carries rather than rows. `orthologParams` with the `uniref`
// source is the query's UniRef cluster across UniProtKB, aligned in the
// browser, no job anywhere; `blastParams` is a phmmer search at EBI. Both take
// the launched transcript's translation as the query row, added by msaView so
// the rows share the genome view's codons. See jbrowse-plugin-msaview's
// DEVELOPERS.md for every field.
export type BuiltMsa =
  | {
      orthologParams: {
        taxId: number
        geneCandidates: string[]
        source: 'uniref'
        identity?: 50 | 90
        msaAlgorithm: 'browser'
        maxSpecies?: number
      }
    }
  | {
      blastParams: {
        searchProgram: 'phmmer'
        blastDatabase: string
        maxHits?: number
      }
    }

export type MsaSource =
  | { kind: 'inline'; msa: InlineMsa }
  | { kind: 'indexed'; msa: IndexedMsa }
  | { kind: 'built'; msa: BuiltMsa }

// Where the primary structure comes from. `pdbId` is the protein3d plugin's
// shorthand for an RCSB entry, and naming the entry rather than a file is what
// lets the plugin fetch the SIFTS UniProt mapping for it.
export type StructureSource = { url: string } | { pdbId: string }

// A hash never leaves the browser; a query string is a request line, and
// CloudFront refuses one over 8,192 bytes. A host that reads only the query
// string (HOST_READS_HASH_PARAMS false) therefore gets a budget, and the inline
// alignment — the one part of a session that can run to tens of KB — is what
// gives way. The genome and structure views always fit: DMD, the largest
// example, is 6 KB without an alignment.
export const QUERY_URL_BUDGET = 8000

// How many bytes a value costs in a launch url, deflated and base64'd the way
// the session is — so an alignment can be cut to fit before it is dropped.
export function encodedSessionBytes(value: unknown) {
  return toUrlSafeB64(JSON.stringify(value)).length
}

// Whether a session built for this target rides in the hash, where nothing
// limits its size, or in the query string, where QUERY_URL_BUDGET does.
export function sessionInHash(target: GeneStructure['target']) {
  return HOST_READS_HASH_PARAMS || isNcbiGffTrack(target.geneTrackId)
}

// A range of structure residues, lit on load across all three views as if it
// had been clicked — how a domain on the map becomes the thing the session
// opens on. `initialSelection` is 0-based half-open over the structure's own
// residues, exact for a model folded from the translation; `initialResidues`
// is inclusive author numbering, which is what a PDB entry is cited by.
interface ResidueRange {
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
  initialResidues?: ResidueRange
  collapse?: boolean
  flip?: boolean
  msa?: MsaSource
  variantTracks?: boolean
  // Less on screen: the genome view without its overview bar and gridlines.
  quiet?: boolean
  // The structure view's pairwise alignment panel. Off when the structure was
  // folded from the launched translation — an identity alignment is a wall of
  // matches with nothing to read — and on when the panel is what says which
  // residues a crystal or another isoform is missing.
  showAlignment?: boolean
}

// The transcript model the MsaView + ProteinView map a residue to its codon
// through. 0-based interbase, CDS subfeatures only.
function connectedFeature(transcript: Transcript, uniqueId = transcript.name) {
  const { start, end } = blockBounds(transcript.cds)
  return {
    uniqueId,
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
  quiet: boolean,
) {
  return {
    id: `lgv-${transcript.geneName}`,
    type: 'LinearGenomeView',
    colorByCDS: true,
    ...(quiet ? { hideHeaderOverview: true, showGridlines: false } : {}),
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
      const { residueRange, highlights } = source.msa
      return {
        ...base,
        // A query row that is one segment of the translation is linked
        // through that segment's codons alone: the row's first residue has to
        // be the feature's first codon for the plugin's mapping to hold.
        ...(residueRange
          ? {
              connectedFeature: connectedFeature(
                {
                  ...transcript,
                  cds: sliceCds(
                    transcript,
                    residueRange.start,
                    residueRange.end,
                  ),
                },
                `${transcript.name}:${residueRange.start}-${residueRange.end}`,
              ),
            }
          : {}),
        ...(highlights?.length ? { highlights } : {}),
        querySeqName: source.msa.querySeqName,
        data: {
          msa: source.msa.fasta,
          ...(source.msa.newick ? { tree: source.msa.newick } : {}),
          gff: source.msa.gff,
        },
      }
    }
    // The hosted 100-way: the session names the file and the gene, and the
    // msaview plugin random-reads that block itself (the .gzi/.idx are found
    // by suffix). The alignment stays out of the URL, which is what keeps a
    // 100-row session small.
    case 'indexed':
      return {
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
    // Built on open. The query row is the launched transcript's translation,
    // the same protein the structure view aligns to, so the three views share
    // codons; a query-anchored alignment is gappy, so the gappiest columns are
    // hidden until the reader asks for them.
    case 'built': {
      const query = proteinSequence ? { proteinSequence } : {}
      return {
        ...base,
        allowedGappyness: 50,
        ...('orthologParams' in source.msa
          ? { orthologParams: { ...source.msa.orthologParams, ...query } }
          : { blastParams: { ...source.msa.blastParams, ...query } }),
      }
    }
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
  {
    initialSelection,
    initialResidues,
    showAlignment,
  }: Pick<
    SessionOptions,
    'initialSelection' | 'initialResidues' | 'showAlignment'
  >,
) {
  return {
    id: `protein-${transcript.geneName}`,
    type: 'ProteinView',
    height: 500,
    zoomToBaseLevel: false,
    ...(showAlignment === false ? { showAlignment: false } : {}),
    structures: [
      {
        ...primary,
        feature,
        userProvidedTranscriptSequence: proteinSequence,
        connectedViewId: `lgv-${transcript.geneName}`,
        ...(initialSelection ? { initialSelection } : {}),
        ...(initialResidues ? { initialResidues } : {}),
      },
      ...superposed,
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
//
// Emitted only for a host that has the tree (HOST_HAS_WORKSPACE_LAYOUT): on
// v4.3.0 the tree is dropped and `useWorkspaces: true` is written into the
// reader's localStorage preference, which is worse than a stacked session.
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
  superposed = [],
  initialSelection,
  initialResidues,
  collapse = true,
  flip = false,
  msa,
  variantTracks = true,
  quiet = false,
  showAlignment = true,
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
    quiet,
  )
  const alignment = msa
    ? msaView(transcript, feature, msa, uniprotId, proteinSequence)
    : undefined
  const protein =
    primary && proteinSequence
      ? proteinView(transcript, feature, primary, proteinSequence, superposed, {
          initialSelection,
          initialResidues,
          showAlignment,
        })
      : undefined

  // A GFF gene track is readable on the gene-track host only, which is `main`,
  // and `main` has the layout tree whatever the production host lacks.
  const geneTrackHost = isNcbiGffTrack(target.geneTrackId)
  const tiled = HOST_HAS_WORKSPACE_LAYOUT || geneTrackHost
  const inHash = HOST_READS_HASH_PARAMS || geneTrackHost
  const assemble = (withAlignment: boolean) => {
    const carried = withAlignment && alignment ? [alignment] : []
    const session = {
      name: `Gene explorer: ${transcript.geneName}`,
      views: [lgv, ...carried, ...(protein ? [protein] : [])],
      ...(protein && tiled
        ? sideBySideLayout([lgv.id, ...carried.map(v => v.id)], protein.id)
        : {}),
    }
    const base = `${JBROWSE_BASE}/${inHash ? '#' : '?'}config=${encodeURIComponent(target.configUrl)}&session=encoded-${toUrlSafeB64(JSON.stringify(session))}`
    return { session, url: geneTrackHost ? onGeneTrackHost(base) : base }
  }
  const full = assemble(true)
  const alignmentOmitted =
    !inHash && alignment !== undefined && full.url.length > QUERY_URL_BUDGET
  return { ...(alignmentOmitted ? assemble(false) : full), alignmentOmitted }
}
