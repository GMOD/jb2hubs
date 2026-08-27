import assert from 'node:assert'
import { test } from 'node:test'

import {
  type GeneStructure,
  buildSessionUrl,
  collapsedLoc,
  geneStats,
  parseGeneTableBlocks,
} from './geneStructure.ts'

// + strand: one UTR-only exon then three coding exons (last partial). Columns are
// tab-separated with empty "coding" columns collapsed to double tabs.
const plusTable = [
  'Reference GRCx NC_000001.1  from: 100 to: 600',
  '',
  'Exon table for  mRNA  NM_000001.1 and protein NP_000001.1',
  'Genomic Interval Exon\t\tGenomic Interval Coding\t\tExon Length',
  '----',
  '50-99\t\t1-50\t\t50',
  '100-200\t\t150-200\t\t101',
  '300-400\t\t300-400\t\t101',
  '500-600\t\t500-550\t\t101',
].join('\n')

test('parseGeneTableBlocks: genomic CDS as interbase, UTR-only exon skipped', () => {
  const tx = parseGeneTableBlocks(plusTable, 1)[0]
  assert.ok(tx)
  assert.equal(tx.mrna, 'NM_000001.1')
  assert.deepEqual(
    tx.cds.map(c => [c.start, c.end]),
    [
      [149, 200],
      [299, 400],
      [499, 550],
    ],
  )
  assert.deepEqual(
    tx.cds.map(c => c.phase),
    [0, 0, 1],
  )
})

test('parseGeneTableBlocks: minus-strand high-to-low intervals normalize', () => {
  const minusTable = [
    'Reference GRCx NC_000002.1  from: 300 to: 700',
    '',
    'Exon table for  mRNA  NM_000002.1 and protein NP_000002.1',
    'Genomic Interval Exon\t\tGenomic Interval Coding\t\tExon Length',
    '----',
    '700-650\t\t90000-90050\t\t51',
    '600-500\t\t550-500\t\t101',
    '400-300\t\t400-300\t\t101',
  ].join('\n')
  const tx = parseGeneTableBlocks(minusTable, -1)[0]
  assert.ok(tx)
  assert.deepEqual(
    tx.cds.map(c => [c.start, c.end]),
    [
      [299, 400],
      [499, 550],
    ],
  )
  assert.ok(tx.cds.every(c => c.end > c.start))
})

const transcript = {
  refName: 'NC_000077.7',
  strand: 1 as const,
  name: 'NM_000001.1',
  geneName: 'Test',
  cds: [
    { start: 100, end: 200, phase: 0 },
    { start: 1000, end: 1080, phase: 1 },
  ],
}

test('collapsedLoc: one region per exon collapsed, whole-gene when not', () => {
  assert.equal(
    collapsedLoc(transcript),
    'NC_000077.7:61-240 NC_000077.7:961-1120',
  )
  assert.equal(
    collapsedLoc(transcript, { collapse: false }),
    'NC_000077.7:101-1080',
  )
})

test('collapsedLoc: flipping reverses the order and marks each region', () => {
  assert.equal(
    collapsedLoc(transcript, { flip: true }),
    'NC_000077.7:961-1120[rev] NC_000077.7:61-240[rev]',
  )
  assert.equal(
    collapsedLoc(transcript, { collapse: false, flip: true }),
    'NC_000077.7:101-1080[rev]',
  )
})

test('geneStats: sums CDS length and the collapse ratio', () => {
  assert.deepEqual(geneStats(transcript), {
    codingBp: 180,
    span: 980,
    ratio: '5.4',
  })
})

// A stand-in for a resolved hosted config: names the gene track the session
// should open, and renames NCBI's accession to what that config calls the
// sequence — the rename buildSessionUrl has to apply everywhere at once.
const target = {
  configUrl: '/hubs/genark/GCF/000/001/635/GCF_000001635.27/config.json',
  assemblyName: 'GCF_000001635.27',
  geneTrackId: 'GCF_000001635.27-ncbiRefSeqSelect',
  canonicalRefName: (refName: string) =>
    refName === 'NC_000077.7' ? 'chr11' : refName,
}

const structure: GeneStructure = {
  symbol: 'Test',
  geneId: '1',
  taxId: 10090,
  assemblyAccession: 'GCF_000001635.27',
  target,
  uniprotId: 'P02340',
  proteinSequence: 'MEEP',
  transcript,
}

interface SessionView {
  id: string
  type: string
  init?: { assembly?: string; loc?: string; tracks?: string[] }
  connectedFeature?: { refName: string }
  structures?: { connectedViewId: string }[]
}

function viewsOf(session: object) {
  return (session as unknown as { views: SessionView[] }).views
}

test('buildSessionUrl: opens the target config with its gene track', () => {
  const { session, url } = buildSessionUrl({ structure })
  assert.match(
    url,
    /#config=%2Fhubs%2Fgenark%2FGCF%2F000%2F001%2F635%2FGCF_000001635\.27%2Fconfig\.json/,
  )
  assert.match(url, /session=encoded-/)
  const views = viewsOf(session)
  const lgv = views[0]!
  const protein = views.find(v => v.type === 'ProteinView')!
  assert.equal(lgv.type, 'LinearGenomeView')
  assert.equal(lgv.init?.assembly, 'GCF_000001635.27')
  // without this the collapsed exons render over an empty view
  assert.deepEqual(lgv.init?.tracks, ['GCF_000001635.27-ncbiRefSeqSelect'])
  // structure links back to the genome view
  assert.equal(protein.structures?.[0]?.connectedViewId, lgv.id)
})

// Displayed-region matching is exact and does not alias-resolve, so the loc and
// the connectedFeature must BOTH carry the config's own name for the sequence.
// One of the two left on NCBI's accession is the silent-no-highlight failure.
test('buildSessionUrl: renames the sequence everywhere the session names it', () => {
  const views = viewsOf(buildSessionUrl({ structure }).session)
  const lgv = views[0]!
  const protein = views.find(v => v.type === 'ProteinView')!
  assert.equal(lgv.init?.loc, 'chr11:61-240 chr11:961-1120')
  assert.equal(
    protein.structures?.[0] &&
      (protein as unknown as { structures: { feature: { refName: string } }[] })
        .structures[0]!.feature.refName,
    'chr11',
  )
})

// The session-level `init: {direction, children}` layout stopped being read when
// the workspace became an MST tree; a session still emitting it stacks its views
// in one column instead of tiling them.
test('buildSessionUrl: emits the workspace layout tree, not the dropped init', () => {
  const { session } = buildSessionUrl({ structure })
  const s = session as unknown as {
    init?: unknown
    useWorkspaces?: boolean
    layout?: {
      direction: string
      children: { size: number; tabs: { viewIds: string[] }[] }[]
    }
  }
  assert.equal(s.init, undefined)
  assert.equal(s.useWorkspaces, true)
  assert.equal(s.layout?.direction, 'row')
  assert.deepEqual(
    s.layout?.children.map(c => c.tabs[0]!.viewIds),
    [['lgv-Test'], ['protein-Test']],
  )
  assert.deepEqual(
    s.layout?.children.map(c => c.size),
    [58, 42],
  )
})

test('buildSessionUrl: an indexed alignment is named, not carried', () => {
  const { session } = buildSessionUrl({
    structure,
    indexedMsa: {
      msaUri: 'https://example.org/100way.fa.gz',
      treeUri: 'https://example.org/100way.nh',
      msaName: 'Test',
      querySeqName: 'hg38',
    },
  })
  const msa = viewsOf(session).find(v => v.type === 'MsaView') as unknown as {
    init?: { msaIndexedLocation?: { uri: string }; msaName?: string }
    data?: unknown
  }
  assert.equal(
    msa.init?.msaIndexedLocation?.uri,
    'https://example.org/100way.fa.gz',
  )
  assert.equal(msa.init?.msaName, 'Test')
  // the alignment stays out of the URL, which is what keeps it small
  assert.equal(msa.data, undefined)
})

test('buildSessionUrl: an inline alignment rides in the session with its domains', () => {
  const { session } = buildSessionUrl({
    structure,
    inlineMsa: {
      fasta: '>mouse\nMEEP',
      newick: '(mouse);',
      gff: '##gff-version 3',
      querySeqName: 'mouse',
    },
  })
  const msa = viewsOf(session).find(v => v.type === 'MsaView') as unknown as {
    data?: { msa: string; tree: string; gff?: string }
    init?: unknown
  }
  assert.equal(msa.data?.msa, '>mouse\nMEEP')
  assert.equal(msa.data?.gff, '##gff-version 3')
  assert.equal(msa.init, undefined)
})
