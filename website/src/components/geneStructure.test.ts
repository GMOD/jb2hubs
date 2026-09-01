import assert from 'node:assert'
import { test } from 'node:test'

import {
  collapsedLoc,
  geneStats,
  orderIsoforms,
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
  assert.equal(tx.protein, 'NP_000001.1')
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

// The coding intervals include the stop codon, so a 393-residue protein is
// listed as 1,182 coding bases. Comparing 394 against a protein record's 393
// is how the isoform match used to miss on every gene.
test('parseGeneTableBlocks: aaLength is the translated length, stop codon excluded', () => {
  const table = [
    'Reference GRCh38.p14 NC_000017.11  from: 7668402 to: 7687538',
    'Exon table for  mRNA  NM_000546.6 and protein NP_000537.3',
    'Genomic Interval Exon\t\tGenomic Interval Coding\t\tExon Length',
    '----',
    '1-1182\t\t1-1182\t\t1182',
  ].join('\n')
  assert.equal(parseGeneTableBlocks(table, 1)[0]?.aaLength, 393)
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

const base = { refName: 'NC_000017.11', strand: 1 as const, geneName: 'PAX6' }
const cds = [{ start: 0, end: 30, phase: 0 }]

// PAX6: the MANE Select is a 436-residue isoform and the longest curated one is
// 504 residues. Longest-first opened the 504 while the structure was the 422;
// the flagged transcript leads now, whatever its length.
test('orderIsoforms: the flagged transcript leads, then curated by length', () => {
  const parsed = [
    { mrna: 'NM_001368910.2', protein: 'NP_1', aaLength: 504, cds },
    { mrna: 'XM_999.1', protein: 'XP_1', aaLength: 600, cds },
    { mrna: 'NM_001368894.2', protein: 'NP_2', aaLength: 436, cds },
    { mrna: 'NM_000280.6', protein: 'NP_3', aaLength: 422, cds },
  ]
  const tags = new Map([['NM_001368894.2', 'MANE Select' as const]])
  const ordered = orderIsoforms(parsed, tags, base)
  assert.deepEqual(
    ordered.map(i => i.transcript.name),
    ['NM_001368894.2', 'NM_001368910.2', 'NM_000280.6', 'XM_999.1'],
  )
  assert.equal(ordered[0]?.tag, 'MANE Select')
  assert.equal(ordered[0]?.protein, 'NP_2')
  assert.equal(ordered[0]?.transcript.geneName, 'PAX6')
})

test('orderIsoforms: a tag matches across an accession version drift', () => {
  const parsed = [
    { mrna: 'NM_1.3', protein: 'NP_1', aaLength: 100, cds },
    { mrna: 'NM_2.1', protein: 'NP_2', aaLength: 300, cds },
  ]
  const tags = new Map([['NM_1.2', 'RefSeq Select' as const]])
  assert.equal(orderIsoforms(parsed, tags, base)[0]?.transcript.name, 'NM_1.3')
})

test('orderIsoforms: with no flags, longest curated first', () => {
  const parsed = [
    { mrna: 'XM_1.1', protein: 'XP_1', aaLength: 900, cds },
    { mrna: 'NM_1.1', protein: 'NP_1', aaLength: 100, cds },
    { mrna: 'NM_2.1', protein: 'NP_2', aaLength: 300, cds },
  ]
  assert.deepEqual(
    orderIsoforms(parsed, new Map(), base).map(i => i.transcript.name),
    ['NM_2.1', 'NM_1.1', 'XM_1.1'],
  )
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
