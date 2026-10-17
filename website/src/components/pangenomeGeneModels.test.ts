import assert from 'node:assert'
import { test } from 'node:test'

import {
  MAX_GENE_SPAN,
  bed12,
  catGeneModelReader,
  referenceReader,
} from './pangenomeGeneModels.ts'

import type { Reference } from './pangenomeGeneModels.ts'

const gencodeRow = (
  id: string,
  start: number,
  end: number,
  tags = 'basic',
  chrom = 'chr1',
) =>
  [
    chrom,
    'HAVANA',
    'transcript',
    start,
    end,
    '.',
    '+',
    '.',
    `ID=${id};transcript_id=${id};tag=${tags}`,
  ].join('\t')

function reference(lines: string[]) {
  const r = referenceReader()
  for (const line of lines) {
    r.add(line)
  }
  return r.transcripts
}

const noReference: Reference = new Map()

function read(lines: string[], ref = noReference) {
  const reader = catGeneModelReader(ref)
  for (const line of lines) {
    reader.add(line)
  }
  return reader.finish()
}

const models = (lines: string[], ref = noReference) => read(lines, ref).models

const row = (
  type: string,
  start: number,
  end: number,
  attrs: string,
  strand = '+',
  score = '.',
) =>
  ['CM094060.1', 'CAT', type, start, end, score, strand, '.', attrs].join('\t')

// CAT's order: a gene row, its transcripts, then their exons and CDS.
const lines = [
  '##gff-version 3',
  row('gene', 101, 900, 'ID=G1;gene_id=G1;gene_name=CFHR1'),
  row('transcript', 101, 900, 'ID=T1;Parent=G1;gene_id=G1;gene_name=CFHR1'),
  row('transcript', 101, 900, 'ID=T2;Parent=G1;gene_id=G1;gene_name=CFHR1'),
  row('exon', 101, 200, 'Parent=T1;gene_name=CFHR1'),
  row('CDS', 151, 200, 'Parent=T1'),
  row('exon', 801, 900, 'Parent=T1'),
  row('CDS', 801, 850, 'Parent=T1'),
  row('intron', 201, 800, 'Parent=T1'),
  row('exon', 101, 900, 'Parent=T2'),
  row('gene', 1001, 1200, 'ID=G2;gene_id=G2;gene_name=LINC01128', '-'),
  row('transcript', 1001, 1200, 'ID=T3;Parent=G2;gene_id=G2', '-'),
  row('exon', 1001, 1200, 'Parent=T3'),
]

test('a coding transcript stands for its gene over a longer non-coding one', () => {
  assert.deepEqual(
    models(lines).map(t => t.id),
    ['T1', 'T3'],
  )
})

test('a transcript is one BED12 row with its exons as blocks and its CDS as the thick span', () => {
  const [coding, noncoding] = models(lines)
  assert.equal(
    bed12(coding!),
    'CM094060.1\t100\t900\tCFHR1\t0\t+\t150\t850\t0\t2\t100,100\t0,700',
  )
  // no CDS: an empty thick span at the start, which draws as all UTR
  assert.equal(
    bed12(noncoding!),
    'CM094060.1\t1000\t1200\tLINC01128\t0\t-\t1000\t1000\t0\t1\t200\t0',
  )
})

test('a gene longer than any real one is dropped, however short its transcripts', () => {
  assert.deepEqual(
    models([
      row('gene', 1, MAX_GENE_SPAN + 2, 'ID=G9;gene_name=BIG'),
      row('transcript', 1, 1000, 'ID=T9'),
      row('exon', 1, 1000, 'Parent=T9'),
    ]),
    [],
  )
})

test('equal transcripts resolve the same way every run', () => {
  const twins = [
    row('gene', 1, 100, 'ID=G;gene_name=X'),
    row('transcript', 1, 100, 'ID=Tb'),
    row('transcript', 1, 100, 'ID=Ta'),
    row('exon', 1, 100, 'Parent=Tb'),
    row('exon', 1, 100, 'Parent=Ta'),
  ]
  assert.equal(models(twins)[0]!.id, 'Ta')
})

// Holding one gene at a time is what keeps a 3.3 GB annotation in memory, so a
// file that is not in CAT's order has to fail rather than lose exons.
test('a row outside its gene is refused', () => {
  assert.throws(
    () =>
      models([
        row('gene', 1, 100, 'ID=G;gene_name=X'),
        row('exon', 1, 100, 'Parent=T'),
        row('transcript', 1, 100, 'ID=T'),
      ]),
    /outside its gene/,
  )
})

test('a gene CAT names only by an Ensembl or novel-gene id, or not at all, is dropped', () => {
  const result = read([
    row('gene', 1, 100, 'ID=G1;gene_name=ENSG00000309177'),
    row('transcript', 1, 100, 'ID=T1'),
    row('exon', 1, 100, 'Parent=T1'),
    row('gene', 201, 300, 'ID=G2;Name=HG00097_ha_G0082767'),
    row('transcript', 201, 300, 'ID=T2'),
    row('exon', 201, 300, 'Parent=T2'),
    row(
      'gene',
      301,
      400,
      'ID=HG00099_ha_G0007232;gene_name=HG00099_ha_G0007232',
    ),
    row('transcript', 301, 400, 'ID=T4'),
    row('exon', 301, 400, 'Parent=T4'),
    row('gene', 401, 500, 'ID=G3;gene_name=GSTM4'),
    row('transcript', 401, 500, 'ID=T3'),
    row('exon', 401, 500, 'Parent=T3'),
    row('gene', 501, 600, 'ID=G5;gene_name=Y_RNA'),
    row('transcript', 501, 600, 'ID=T5'),
    row('exon', 501, 600, 'Parent=T5'),
  ])
  assert.deepEqual(
    result.models.map(t => t.name),
    ['GSTM4', 'Y_RNA'],
  )
  assert.equal(result.unnamed, 3)
})

test('Ensembl canonical transcript stands for its gene over a longer isoform', () => {
  // GSTM2 in HG00097#1: GSTM2-204, stretched to 23 kb, has the longest CDS
  const ref = reference([
    gencodeRow(
      'ENST00000241337.9',
      109668057,
      109675286,
      'basic,Ensembl_canonical',
    ),
    gencodeRow('ENST00000369831.6', 109668022, 109709039),
  ])
  const gstm2 = [
    row('gene', 1, 23125, 'ID=G;gene_name=GSTM2'),
    row('transcript', 1, 23125, 'ID=T204;source_transcript=ENST00000369831.6'),
    row('transcript', 36, 7311, 'ID=T201;source_transcript=ENST00000241337.9'),
    row('CDS', 1, 900, 'Parent=T204'),
    row('CDS', 36, 700, 'Parent=T201'),
  ]
  assert.equal(models(gstm2, ref)[0]!.id, 'T201')
})

test('of two projections of the canonical, the one nearest its GRCh38 span stands', () => {
  const ref = reference([
    gencodeRow('ENST1.1', 1001, 2000, 'Ensembl_canonical'),
  ])
  const projections = [
    row('gene', 1, 30000, 'ID=G;gene_name=X'),
    row('transcript', 1, 30000, 'ID=Ta;source_transcript=ENST1.1'),
    row('transcript', 1, 1000, 'ID=Tb;source_transcript=ENST1.1'),
    row('exon', 1, 500, 'Parent=Ta'),
    row('exon', 29501, 30000, 'Parent=Ta'),
    row('exon', 1, 500, 'Parent=Tb'),
    row('exon', 501, 1000, 'Parent=Tb'),
  ]
  assert.equal(models(projections, ref)[0]!.id, 'Tb')
})

// HG00097#1 lacks GSTM1, and CAT projected GSTM1 onto GSTM2's exons: one
// locus, two genes, with GSTM1's alignment at 93.4% where liftoff placed GSTM2.
const gstm = reference([
  gencodeRow('ENST00000241337.9', 109668057, 109675286, 'Ensembl_canonical'),
  gencodeRow('ENST00000309851.10', 109687817, 109693745, 'Ensembl_canonical'),
])
const phantom = (gstm1Score: string, gstm1Ref = 'ENST00000309851.10') => [
  row('gene', 1001, 8000, 'ID=G2;gene_name=GSTM2'),
  row(
    'transcript',
    1001,
    8000,
    'ID=T2;source_transcript=ENST00000241337.9',
    '+',
    '100',
  ),
  row('CDS', 1101, 1300, 'Parent=T2'),
  row('CDS', 5001, 5400, 'Parent=T2'),
  row('gene', 1003, 8000, 'ID=G1;gene_name=GSTM1'),
  row(
    'transcript',
    1003,
    8000,
    `ID=T1;source_transcript=${gstm1Ref}`,
    '+',
    gstm1Score,
  ),
  row('CDS', 1101, 1300, 'Parent=T1'),
  row('CDS', 5001, 5400, 'Parent=T1'),
]

test('a gene projected onto another gene’s coding exons is dropped', () => {
  const result = read(phantom('9340'), gstm)
  assert.deepEqual(
    result.models.map(t => t.name),
    ['GSTM2'],
  )
  assert.equal(result.stacked, 1)
})

test('of two stacked genes, the one CAT aligned better keeps the locus', () => {
  const realigned = phantom('9340').map(l =>
    l.includes('ID=T2;') ? l.replace('\t100\t', '\t9200\t') : l,
  )
  assert.deepEqual(
    models(realigned, gstm).map(t => t.name),
    ['GSTM1'],
  )
})

test('genes that share coding exons in GRCh38 too, as a readthrough does, are both kept', () => {
  const readthrough = reference([
    gencodeRow('ENST00000241337.9', 109668057, 109675286, 'Ensembl_canonical'),
    gencodeRow('ENSTRT.1', 109668057, 109693745, 'Ensembl_canonical'),
  ])
  assert.deepEqual(
    models(phantom('9340', 'ENSTRT.1'), readthrough).map(t => t.name),
    ['GSTM2', 'GSTM1'],
  )
})

test('GENCODE transcripts are read with their span and canonical tag', () => {
  const ref = reference([
    '##gff-version 3',
    gencodeRow(
      'ENST00000241337.9',
      109668057,
      109675286,
      'basic,Ensembl_canonical,MANE_Select',
    ),
    gencodeRow('ENST00000369831.6', 109668022, 109709039, 'basic'),
  ])
  assert.deepEqual(ref.get('ENST00000241337.9'), {
    refName: 'chr1',
    start: 109668056,
    end: 109675286,
    canonical: true,
  })
  assert.equal(ref.get('ENST00000369831.6')?.canonical, false)
})
