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
    collapsedLoc(transcript, true),
    'NC_000077.7:61-240 NC_000077.7:961-1120',
  )
  assert.equal(collapsedLoc(transcript, false), 'NC_000077.7:101-1080')
})

test('geneStats: sums CDS length and the collapse ratio', () => {
  assert.deepEqual(geneStats(transcript), {
    codingBp: 180,
    span: 980,
    ratio: '5.4',
  })
})

test('buildSessionUrl: assembly from merge API, connected genome + structure', () => {
  const structure: GeneStructure = {
    symbol: 'Test',
    geneId: '1',
    taxId: 10090,
    assemblyAccession: 'GCF_000001635.27',
    uniprotId: 'P02340',
    proteinSequence: 'MEEP',
    transcript,
  }
  const { session, url } = buildSessionUrl({ structure })
  // the config URL is encodeURIComponent'd, so hubIds= reads as hubIds%3D
  assert.match(url, /hubIds%3DGCF_000001635\.27/)
  assert.match(url, /session=encoded-/)
  const views = (
    session as unknown as {
      views: {
        id: string
        type: string
        init?: { assembly?: string }
        structures?: { connectedViewId: string }[]
      }[]
    }
  ).views
  const lgv = views[0]!
  const protein = views.find(v => v.type === 'ProteinView')!
  assert.equal(lgv.type, 'LinearGenomeView')
  assert.equal(lgv.init?.assembly, 'GCF_000001635.27')
  // structure links back to the genome view
  assert.equal(protein.structures?.[0]?.connectedViewId, lgv.id)
})
