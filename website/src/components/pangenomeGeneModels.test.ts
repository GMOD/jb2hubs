import assert from 'node:assert'
import { test } from 'node:test'

import {
  MAX_GENE_SPAN,
  bed12,
  catTranscriptReader,
  representativeTranscripts,
} from './pangenomeGeneModels.ts'

function readCatTranscripts(lines: string[]) {
  const reader = catTranscriptReader()
  for (const line of lines) {
    reader.add(line)
  }
  return reader.transcripts()
}

const row = (
  type: string,
  start: number,
  end: number,
  attrs: string,
  strand = '+',
) => ['CM094060.1', 'CAT', type, start, end, '.', strand, '.', attrs].join('\t')

// CAT's order is gene, transcript, then its exons and CDS; a coordinate-sorted
// copy can put an exon ahead of its transcript, so both have to read the same.
const lines = [
  '##gff-version 3',
  row('gene', 101, 900, 'ID=G1;gene_id=G1;gene_name=CFHR1'),
  row('exon', 101, 200, 'Parent=T1'),
  row('transcript', 101, 900, 'ID=T1;Parent=G1;gene_id=G1;gene_name=CFHR1'),
  row('CDS', 151, 200, 'Parent=T1'),
  row('exon', 801, 900, 'Parent=T1'),
  row('CDS', 801, 850, 'Parent=T1'),
  row('intron', 201, 800, 'Parent=T1'),
  row('transcript', 101, 900, 'ID=T2;Parent=G1;gene_id=G1;gene_name=CFHR1'),
  row('exon', 101, 900, 'Parent=T2'),
  row(
    'transcript',
    1001,
    1200,
    'ID=T3;Parent=G2;gene_id=G2;gene_name=ENSG00000239945',
    '-',
  ),
  row('exon', 1001, 1200, 'Parent=T3'),
]

test('a coding transcript stands for its gene over a longer non-coding one', () => {
  const chosen = representativeTranscripts(readCatTranscripts(lines))
  assert.deepEqual(
    chosen.map(t => t.id),
    ['T1', 'T3'],
  )
})

test('a transcript is one BED12 row with its exons as blocks and its CDS as the thick span', () => {
  const [coding, noncoding] = representativeTranscripts(
    readCatTranscripts(lines),
  )
  assert.equal(
    bed12(coding!),
    'CM094060.1\t100\t900\tCFHR1\t0\t+\t150\t850\t0\t2\t100,100\t0,700',
  )
  // no CDS: an empty thick span at the start, which draws as all UTR
  assert.equal(
    bed12(noncoding!),
    'CM094060.1\t1000\t1200\tENSG00000239945\t0\t-\t1000\t1000\t0\t1\t200\t0',
  )
})

test('a gene longer than any real one is dropped', () => {
  const huge = [
    row('transcript', 1, MAX_GENE_SPAN + 2, 'ID=T9;gene_id=G9;gene_name=BIG'),
    row('exon', 1, MAX_GENE_SPAN + 2, 'Parent=T9'),
  ]
  assert.deepEqual(representativeTranscripts(readCatTranscripts(huge)), [])
})

test('equal transcripts resolve the same way every run', () => {
  const twins = [
    row('transcript', 1, 100, 'ID=Tb;gene_id=G;gene_name=X'),
    row('exon', 1, 100, 'Parent=Tb'),
    row('transcript', 1, 100, 'ID=Ta;gene_id=G;gene_name=X'),
    row('exon', 1, 100, 'Parent=Ta'),
  ]
  assert.equal(
    representativeTranscripts(readCatTranscripts(twins))[0]!.id,
    'Ta',
  )
})
