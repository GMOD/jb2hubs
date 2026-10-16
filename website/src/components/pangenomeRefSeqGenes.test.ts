import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseRefSeqGenes } from './pangenomeRefSeqGenes.ts'

const gff = (type: string, start: number, end: number, attrs: string) =>
  ['chr1', 'bed2gff', type, start, end, '.', '+', '.', attrs].join('\t')

test('a gene takes its own GFF span, not the span of a paralog beside it', () => {
  const genes = parseRefSeqGenes([
    gff('gene', 109668057, 109683997, 'ID=GSTM2;gene_id=GSTM2'),
    gff('transcript', 109668057, 109683997, 'ID=NM_001142368.2;Parent=GSTM2'),
    gff('gene', 109687817, 109693745, 'ID=GSTM1;gene_id=GSTM1'),
    gff('transcript', 109687817, 109693745, 'ID=NM_000561.4;Parent=GSTM1'),
  ])
  assert.deepEqual(genes, [
    { symbol: 'GSTM2', start: 109668056, end: 109683997 },
    { symbol: 'GSTM1', start: 109687816, end: 109693745 },
  ])
})

test('a predicted coding model counts, a non-coding gene does not', () => {
  const genes = parseRefSeqGenes([
    gff('gene', 100, 200, 'ID=GENEA'),
    gff('transcript', 100, 200, 'ID=XM_005270782.6;Parent=GENEA'),
    gff('gene', 300, 400, 'ID=LINC1'),
    gff('transcript', 300, 400, 'ID=NR_024321.1;Parent=LINC1'),
  ])
  assert.deepEqual(
    genes.map(g => g.symbol),
    ['GENEA'],
  )
})

test('exon and CDS lines add nothing', () => {
  const genes = parseRefSeqGenes([
    gff('gene', 100, 200, 'ID=GENEA'),
    gff('transcript', 100, 200, 'ID=NM_1.1;Parent=GENEA'),
    gff('exon', 100, 150, 'ID=exon-NM_1.1-1;Parent=NM_1.1'),
    gff('CDS', 110, 150, 'ID=cds-NP_1.1;Parent=NM_1.1'),
  ])
  assert.equal(genes.length, 1)
})
