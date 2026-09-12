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
  type PlacedQuery,
  fetchPfamSeed,
  fetchPfamTree,
  placeQuery,
  queryLabel,
} from './pfamSeed.ts'
import { alignProteinPanel } from './proteinMsa.ts'
import {
  QUERY_URL_BUDGET,
  buildSessionUrl,
  encodedSessionBytes,
  sessionInHash,
} from './proteinSession.ts'

import type { GeneStructure } from './geneStructure.ts'
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
  // for the seed, the translation the query row was cut from, pinned
  structureOverrides?: Pick<GeneStructure, 'proteinSequence' | 'transcript'>
  // a caveat about the alignment itself, shown beside it
  note?: string
}

// How far either side of a domain's InterPro coordinates the local alignment
// looks for it in the translation. The coordinates are on the canonical
// sequence and the translation may be another isoform; forty residues absorbs
// the usual exon's worth of drift, and a miss is reported, not guessed.
const SEED_WINDOW = 40

// What a launch can carry. In the hash, the msaview plugin's snapshot is the
// limit: its data model drops any field over 50,000 characters, silently, and
// the alignment is one field. In the query string (the production host, see
// proteinSession.ts) the request line is, and buildSessionUrl drops an
// alignment that would put the url over it. A seed thinned to fit is still the
// family, anchored on the rows nearest the query; an alignment dropped at the
// door is not — so the seed is cut to the room the url has before the session
// is built. Measured 2026-09-12: NOTCH1's EGF seed is 4.9 KB of FASTA and 2.8 KB
// of tree, which deflate to more than the 6 KB left beside the genome and
// structure views, and the first draft's fixed character budget let it through
// to be dropped whole.
const SNAPSHOT_FIELD_BUDGET = 45_000

// Room in the url for the alignment: the budget less what the rest of this
// gene's session costs. The exons decide most of it (DMD's 79 coding exons are
// 6 KB on their own), and the MsaView's own shell the rest — its connected
// feature is the transcript sliced to the domain, exons again — so the session
// measured carries a one-residue stand-in for the alignment, on the domain,
// with the options a focused launch sets. A structure of typical url length
// stands in for the one the card will pick. Measured 2026-09-12 on BRAF: the
// shell is 294 bytes beyond the alignment's own, which a room that left it out
// let a 26-row seed fill and buildSessionUrl then dropped at the door.
function urlRoomForAlignment(structure: GeneStructure, domain: ProteinRegion) {
  const without = buildSessionUrl({
    structure,
    primary: {
      url: 'https://alphafold.ebi.ac.uk/files/AF-P00000-F1-model_v6.cif',
    },
    msa: {
      kind: 'inline',
      msa: {
        fasta: '>Q/1-1\nA',
        querySeqName: 'Q/1-1',
        residueRange: { start: domain.start, end: domain.end },
        highlights: [{ row: 'Q/1-1', start: 1, end: 1, label: 'residue 1' }],
      },
    },
    initialSelection: { start: 0, end: 1 },
    quiet: true,
  }).url.length
  return QUERY_URL_BUDGET - without - 64
}

// The largest placement whose encoded alignment fits `room`: whole with its
// tree, whole without it, then thinned by steps, at each step with the tree
// pruned to the rows that stay before without it. `place` runs the alignment
// for a FASTA budget and an optional tree; `measure` is what the session would
// pay to carry the result.
export function fitPlacement(
  place: (maxChars: number, withTree: boolean) => PlacedQuery,
  room: number | undefined,
  measure: (placed: PlacedQuery) => number,
): PlacedQuery {
  const whole = place(SNAPSHOT_FIELD_BUDGET, true)
  if (room === undefined || measure(whole) <= room) {
    return whole
  }
  let candidate = place(SNAPSHOT_FIELD_BUDGET, false)
  let maxChars = whole.fasta.length
  // kept falls monotonically as the budget does, so this ends at the anchor
  // alone if nothing larger fits
  while (measure(candidate) > room && candidate.kept > 1) {
    maxChars = Math.floor(maxChars * 0.75)
    const withTree = place(maxChars, true)
    if (measure(withTree) <= room) {
      return withTree
    }
    candidate = place(maxChars, false)
  }
  return candidate
}

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
  const placed = fitPlacement(
    (maxChars, withTree) =>
      placeQuery(proteinSequence, seed, {
        queryName: queryLabel(symbol),
        uniprotId,
        window: {
          start: domain.start - 1 - SEED_WINDOW,
          end: domain.end + SEED_WINDOW,
        },
        newick: withTree ? tree : undefined,
        maxChars,
      }),
    sessionInHash(structure.target)
      ? undefined
      : urlRoomForAlignment(structure, domain),
    p => encodedSessionBytes({ msa: p.fasta, tree: p.newick }),
  )
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
    : tree && !placed.newick
      ? ' The tree does not fit in a launch beside the rows and is left out.'
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

// The live panel aligned at EBI, with the CDD domains as a per-row overlay.
// The signal is what stops the EBI polling when the reader has moved on to
// another gene — the job can otherwise run to its three-minute deadline.
export async function loadLive(
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
