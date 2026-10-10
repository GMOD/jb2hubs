// The alignments the protein browser launches with, each resolved into the one
// shape the session builder reads. Data only, no React: the launch checker runs
// these outside a browser.
//
// They answer different questions, and the page picks one by the question:
// `pfam` is what a domain looks like across life (the family's curated seed, a
// few dozen representatives); `orthologs` is how conserved each residue of THIS
// protein is across species, as the 100-way, NCBI's ortholog set or the UniRef
// cluster, whichever the gene has. The seed and the 100-way are alignments the
// page reads; the other two are requests the msaview plugin resolves when the
// session opens.

import {
  HUNDRED_WAY_MSA,
  HUNDRED_WAY_TREE,
  fetchHundredWayAlignment,
  fetchHundredWayTranscript,
} from './hundredWay.ts'
import { DATASETS, ncbiJson } from './ncbiFetch.ts'
import {
  SeedRefused,
  fetchPfamSeed,
  fetchPfamTree,
  placeQuery,
  queryLabel,
} from './pfamSeed.ts'

import type { GeneStructure } from './geneStructure.ts'
import type { Focus, ProteinRegion } from './proteinFeatures.ts'
import type { MsaSource, ResidueRange } from './proteinSession.ts'

export type AlignSource = 'pfam' | 'orthologs'

export interface LoadedAlignment {
  // what the launched session carries
  source: MsaSource
  // rows the session's MsaView comes up with, where the page reads them
  rowCount?: number
  // what the session opens with, in words
  carries: string
  // for the 100-way, the knownCanonical model the alignment was built from —
  // swapped into the session so genome, alignment and structure share codons;
  // for the seed, the translation the query row was cut from, pinned
  structureOverrides?: Pick<GeneStructure, 'proteinSequence' | 'transcript'>
  // a caveat about the alignment itself
  note?: string
}

// How far either side of a domain's InterPro coordinates the local alignment
// looks for it in the translation. The coordinates are on the canonical
// sequence and the translation may be another isoform; forty residues absorbs
// the usual exon's worth of drift, and a miss is reported, not guessed.
const SEED_WINDOW = 40

// What a launch url will carry of a seed, in FASTA characters. The msaview
// plugin reads an inline alignment of any size and keeps it in IndexedDB
// (its test/sessionSnapshot.test.ts boots 120,000); it leaves one over 50,000
// out of a session it writes, so a link shared from inside JBrowse reopens a
// larger seed only in the browser that built it. A seed thinned to fit is still
// the family, anchored on the rows nearest the query.
const SEED_BUDGET = 250_000

// The Pfam seed of the domain a focus sits in, with the launched translation's
// own domain segment placed in it as the linked row. Three reads, no job: the
// seed and its tree in parallel, then milliseconds of alignment here.
export async function loadPfam(
  structure: GeneStructure,
  domain: ProteinRegion,
): Promise<LoadedAlignment> {
  const { proteinSequence, symbol, uniprotId } = structure
  if (!proteinSequence || !domain.pfam) {
    throw new SeedRefused('No translation to place in the seed alignment')
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
    maxChars: SEED_BUDGET,
  })
  const rowCount = placed.kept + 1
  const family = `${domain.pfam} ${seed.id ?? domain.name}`
  const anchorNote = placed.replaced
    ? `${symbol} is itself a seed member (${placed.anchor.name}); its row is the linked one.`
    : `${symbol} residues ${placed.domain.start}–${placed.domain.end} placed through ${placed.anchor.name} at ${Math.round(placed.anchor.identity * 100)}% identity.`
  const thinNote = placed.thinned
    ? ` ${placed.kept} of the seed's ${placed.total} rows, those nearest ${symbol}, fit in a launch${placed.newick ? ', with the tree pruned to them' : '; the tree is left out with the rest'}.`
    : ''
  const untreedNote = placed.untreed
    ? ` ${placed.untreed} seed ${placed.untreed === 1 ? 'row' : 'rows'} the family's tree does not name ${placed.untreed === 1 ? 'is' : 'are'} left out.`
    : ''
  return {
    source: {
      kind: 'inline',
      msa: {
        fasta: placed.fasta,
        newick: placed.newick,
        querySeqName: placed.queryName,
        residueRange: placed.domain,
      },
    },
    rowCount,
    carries: `the ${family} seed alignment (${rowCount} rows)`,
    structureOverrides: {
      proteinSequence,
      transcript: structure.transcript,
    },
    note: anchorNote + thinNote + untreedNote,
  }
}

// A focused residue inside a seed's query segment, marked on the query row in
// the row's own coordinates. `selection` is the focus carried onto the
// launched translation, which the segment counts on; the focus itself counts
// on the canonical, and the two differ wherever the isoform does.
export function markFocus(
  source: MsaSource | undefined,
  focus: Focus | undefined,
  selection: readonly ResidueRange[] | undefined,
): MsaSource | undefined {
  const range = source?.kind === 'inline' ? source.msa.residueRange : undefined
  const residue = selection?.length === 1 ? selection[0]! : undefined
  if (
    source?.kind !== 'inline' ||
    !range ||
    focus?.kind !== 'residue' ||
    !residue ||
    residue.start !== residue.end ||
    residue.start < range.start ||
    residue.start > range.end
  ) {
    return source
  }
  const at = residue.start - range.start + 1
  return {
    ...source,
    msa: {
      ...source.msa,
      highlights: [
        {
          row: source.msa.querySeqName,
          start: at,
          end: at,
          label: focus.label ?? `residue ${focus.position}`,
        },
      ],
    },
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
    rowCount: msa.rowCount,
    carries: `the 100-vertebrate alignment (${msa.rowCount} rows)`,
    structureOverrides: { proteinSequence: msa.querySequence, transcript },
  }
}

// Rows a built alignment asks for: a lookup, so a hundred rows cost only the
// in-browser alignment.
const BUILT_ROWS = 100

// The plugin builds NCBI's set only with two orthologs beside the query, and
// fails inside the session with fewer, with nothing to fall back on.
const MIN_NCBI_ORTHOLOGS = 3

async function ncbiOrthologCount(geneId: string) {
  const json = await ncbiJson<{ reports?: unknown[] }>(
    `${DATASETS}/gene/id/${geneId}/orthologs?returned_content=IDS_ONLY`,
  )
  return json.reports?.length ?? 0
}

// This protein's orthologs, by what the gene has: the 100-way where it has a
// row and the transcript is the one it pins, else NCBI's ortholog set, one
// curated gene per species, which exists for vertebrates and insects, else the
// UniRef50 cluster, which exists for anything UniProt knows. NCBI's and
// UniRef's are built from the launched translation, so they suit any isoform.
// PANTHER, which covers plants, fungi and worms, is not offered: whether it
// has the gene is known only by asking it for the orthologs.
export async function loadOrthologs(
  structure: GeneStructure,
  hundredWay: boolean,
): Promise<LoadedAlignment> {
  if (hundredWay) {
    return loadHundredWay(structure.symbol)
  }
  const count = await ncbiOrthologCount(structure.geneId).catch(() => 0)
  return count >= MIN_NCBI_ORTHOLOGS
    ? {
        source: {
          kind: 'built',
          msa: {
            orthologParams: {
              taxId: structure.taxId,
              geneCandidates: [structure.symbol, structure.geneId],
              source: 'ncbi',
              msaAlgorithm: 'browser',
              maxSpecies: BUILT_ROWS,
            },
          },
        },
        carries: `NCBI's ortholog set (${count} genes), aligned on open`,
      }
    : loadUniref(structure)
}

// The query's UniRef50 cluster across UniProtKB, a request the msaview plugin
// resolves in the browser on open, with no job anywhere. It is given the gene's
// UniProt accession first and its symbol second, so the lookup goes by
// accession where the gene has one.
export function loadUniref(structure: GeneStructure): LoadedAlignment {
  return {
    source: {
      kind: 'built',
      msa: {
        orthologParams: {
          taxId: structure.taxId,
          geneCandidates: [
            ...(structure.uniprotId ? [structure.uniprotId] : []),
            structure.symbol,
          ],
          source: 'uniref',
          msaAlgorithm: 'browser',
          maxSpecies: BUILT_ROWS,
        },
      },
    },
    carries: 'the UniRef50 cluster, aligned on open',
  }
}
