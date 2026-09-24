// The alignments the protein browser can show and launch with, each resolved
// into the one shape the session builder and the embedded viewer read. Data
// only, no React: the launch checker runs these outside a browser.
//
// They answer different questions, and the page offers them by question rather
// than by database: `pfam` is what a domain looks like across life (the
// family's curated seed, a few dozen representatives), `hundredWay` and `live`
// are how conserved each residue of THIS protein is across species (orthologs),
// `uniref` is the protein's own cluster, `phmmer` is a search. The first three
// are alignments this page holds; the last two are requests the msaview plugin
// resolves when the session opens, so the page has nothing to draw for them.

import {
  HUNDRED_WAY_MSA,
  HUNDRED_WAY_TREE,
  fetchHundredWayAlignment,
  fetchHundredWayTranscript,
} from './hundredWay.ts'
import {
  fetchPfamSeed,
  fetchPfamTree,
  placeQuery,
  queryLabel,
} from './pfamSeed.ts'
import { alignProteinPanel, parseFasta } from './proteinMsa.ts'

import type { GeneStructure, Isoform } from './geneStructure.ts'
import type { Focus, ProteinRegion } from './proteinFeatures.ts'
import type { ProteinAlignment, ProteinPanel } from './proteinMsa.ts'
import type { MsaHighlight, MsaSource } from './proteinSession.ts'

export type AlignSource = 'pfam' | 'live' | 'hundredWay' | 'uniref' | 'phmmer'

export interface LoadedAlignment {
  // what the launched session carries
  source: MsaSource
  // what the embedded viewer renders: for the indexed source this is the block
  // read out of the hosted file, which the session names rather than carries.
  // Absent for a source built on open.
  fasta?: string
  rowCount?: number
  // what the launch card says the session opens with
  carries: string
  // for the 100-way, the knownCanonical model the alignment was built from —
  // swapped into the session so genome, alignment and structure share codons;
  // for the seed, the translation the query row was cut from, pinned; for the
  // live panel, the isoform its query row is the protein of
  structureOverrides?: Pick<GeneStructure, 'proteinSequence' | 'transcript'>
  // a caveat about the alignment itself, shown beside it
  note?: string
}

// How far either side of a domain's InterPro coordinates the local alignment
// looks for it in the translation. The coordinates are on the canonical
// sequence and the translation may be another isoform; forty residues absorbs
// the usual exon's worth of drift, and a miss is reported, not guessed.
const SEED_WINDOW = 40

// The msaview plugin's data model drops any snapshot field over 50,000
// characters, silently, and the alignment is one field. A seed thinned to fit
// is still the family, anchored on the rows nearest the query.
const SNAPSHOT_FIELD_BUDGET = 45_000

// The Pfam seed of the domain a focus sits in, with the launched translation's
// own domain segment placed in it as the linked row. Three reads, no job: the
// seed and its tree in parallel, then milliseconds of alignment here.
export async function loadPfam(
  structure: GeneStructure,
  domain: ProteinRegion,
  focus: Focus | undefined,
): Promise<LoadedAlignment> {
  const { proteinSequence, symbol, uniprotId } = structure
  if (!proteinSequence || !domain.pfam) {
    throw new Error('No translation to place in the seed alignment')
  }
  const [seed, tree] = await Promise.all([
    fetchPfamSeed(domain.pfam),
    fetchPfamTree(domain.pfam),
  ])
  const placed = placeQuery(proteinSequence, seed, {
    queryName: queryLabel(symbol),
    uniprotId,
    window: {
      start: domain.start - 1 - SEED_WINDOW,
      end: domain.end + SEED_WINDOW,
    },
    newick: tree,
    maxChars: SNAPSHOT_FIELD_BUDGET,
  })
  // A focused residue inside the segment is marked on the query row, in the
  // row's own coordinates.
  const highlights: MsaHighlight[] =
    focus?.kind === 'residue' &&
    focus.position >= placed.domain.start &&
    focus.position <= placed.domain.end
      ? [
          {
            row: placed.queryName,
            start: focus.position - placed.domain.start + 1,
            end: focus.position - placed.domain.start + 1,
            label: focus.label ?? `residue ${focus.position}`,
          },
        ]
      : []
  const rowCount = placed.kept + 1
  const family = `${domain.pfam} ${seed.id ?? domain.name}`
  const anchorNote = placed.replaced
    ? `${symbol} is itself a seed member (${placed.anchor.name}); its row is the linked one.`
    : `${symbol} residues ${placed.domain.start}–${placed.domain.end} placed through ${placed.anchor.name} at ${Math.round(placed.anchor.identity * 100)}% identity.`
  const thinNote = placed.thinned
    ? ` ${placed.kept} of the seed's ${placed.total} rows, those nearest ${symbol}, fit in a launch${placed.newick ? ', with the tree pruned to them' : '; the tree is left out with the rest'}.`
    : ''
  return {
    source: {
      kind: 'inline',
      msa: {
        fasta: placed.fasta,
        newick: placed.newick,
        querySeqName: placed.queryName,
        residueRange: placed.domain,
        highlights,
      },
    },
    fasta: placed.fasta,
    rowCount,
    carries: `the ${family} seed alignment (${rowCount} rows)`,
    structureOverrides: {
      proteinSequence,
      transcript: structure.transcript,
    },
    note: anchorNote + thinNote,
  }
}

// The hosted 100-way for one gene: the alignment block, and the transcript it
// was built from so the session's connectedFeature shares its codon ordinals.
// The aligned hg38 row is the knownCanonical translation, so it is the protein
// whose residues the alignment's columns count.
export async function loadHundredWay(symbol: string): Promise<LoadedAlignment> {
  const [msa, transcript] = await Promise.all([
    fetchHundredWayAlignment(symbol),
    fetchHundredWayTranscript(symbol),
  ])
  if (!msa || !transcript) {
    throw new Error(`No 100-way alignment row for ${symbol}`)
  }
  return {
    source: {
      kind: 'indexed',
      msa: {
        msaUri: HUNDRED_WAY_MSA,
        treeUri: HUNDRED_WAY_TREE,
        msaName: symbol,
        querySeqName: msa.querySeqName,
      },
    },
    fasta: msa.fasta,
    rowCount: msa.rowCount,
    carries: `a ${msa.rowCount}-row alignment`,
    structureOverrides: { proteinSequence: msa.querySequence, transcript },
  }
}

// One AbortSignal at a time: asking for the next aborts the last. The page asks
// on every alignment fetch and stops on unmount, so a superseded EBI job stops
// polling rather than running to its three-minute deadline and posting its
// progress over its successor's.
export function latestJob() {
  let current: AbortController | undefined
  return {
    next() {
      current?.abort()
      current = new AbortController()
      return current.signal
    },
    stop() {
      current?.abort()
    },
  }
}

const bareAccession = (acc: string) => acc.replace(/\.\d+$/, '')

// The isoform an ortholog panel's query row is the protein of. The panel picks
// its own (MANE or RefSeq Select, else the longest, XP_ included), and the
// msaview plugin maps the row's residues to the connected transcript's codons
// by position, so any other isoform shifts them. A RefSeq row names its
// protein; a PANTHER row is a UniProt entry, which matches the representative
// isoform only where the two sequences agree.
export function queryIsoform(
  structure: Pick<GeneStructure, 'isoforms' | 'proteinSequence'>,
  protein: string,
  sequence: string,
): Isoform | undefined {
  const { isoforms, proteinSequence } = structure
  return (
    isoforms.find(i => i.protein === protein) ??
    isoforms.find(i => bareAccession(i.protein) === bareAccession(protein)) ??
    (sequence === proteinSequence ? isoforms[0] : undefined)
  )
}

// The live panel aligned at EBI, with the CDD domains as a per-row overlay,
// launched on the isoform whose protein the query row is.
export async function loadLive(
  structure: GeneStructure,
  panel: ProteinPanel,
  precomputed: ProteinAlignment | undefined,
  onProgress: (s: string) => void,
  signal: AbortSignal,
): Promise<LoadedAlignment> {
  const aligned =
    precomputed ?? (await alignProteinPanel(panel, { onProgress, signal }))
  const queryRow =
    panel.rows.find(r => r.taxId === panel.query.refTaxonId) ?? panel.rows[0]!
  const rowCount = (aligned.fasta.match(/^>/gm) ?? []).length
  const querySequence = (
    parseFasta(aligned.fasta).get(queryRow.label) ?? ''
  ).replaceAll(/[-.]/g, '')
  const isoform = queryIsoform(structure, queryRow.protein, querySequence)
  return {
    source: {
      kind: 'inline',
      msa: {
        fasta: aligned.fasta,
        newick: aligned.newick,
        gff: aligned.gff,
        querySeqName: queryRow.label,
      },
    },
    fasta: aligned.fasta,
    rowCount,
    carries: `a ${rowCount}-row alignment`,
    structureOverrides: isoform
      ? { transcript: isoform.transcript, proteinSequence: querySequence }
      : {
          transcript: structure.transcript,
          proteinSequence: structure.proteinSequence,
        },
    ...(isoform
      ? {}
      : {
          note: `The ${queryRow.label} row is ${queryRow.protein}, which none of ${structure.symbol}'s isoforms translates to, so its residues meet ${structure.transcript.name}'s codons by position and are approximate.`,
        }),
  }
}

// Rows the built sources ask for. UniRef is a lookup, so a hundred rows cost
// only the in-browser alignment; phmmer's count is what EBI reports back.
const BUILT_ROWS = 100

// A request the msaview plugin resolves on open, so the page has nothing to
// fetch: the query's UniRef50 cluster across UniProtKB aligned in the browser
// (no job anywhere), or a phmmer search at EBI whose queue decides the wait.
// Both are given the gene's UniProt accession first and its symbol second, so
// the lookup goes by accession where the gene has one.
export function loadBuilt(
  source: 'uniref' | 'phmmer',
  structure: GeneStructure,
): LoadedAlignment {
  const candidates = [
    ...(structure.uniprotId ? [structure.uniprotId] : []),
    structure.symbol,
  ]
  return source === 'uniref'
    ? {
        source: {
          kind: 'built',
          msa: {
            orthologParams: {
              taxId: structure.taxId,
              geneCandidates: candidates,
              source: 'uniref',
              msaAlgorithm: 'browser',
              maxSpecies: BUILT_ROWS,
            },
          },
        },
        carries: 'the UniRef cluster, aligned on open',
      }
    : {
        source: {
          kind: 'built',
          msa: {
            blastParams: {
              searchProgram: 'phmmer',
              blastDatabase: 'rp15',
              maxHits: BUILT_ROWS,
            },
          },
        },
        carries: 'a phmmer search across the tree of life, run on open',
      }
}
