import assert from 'node:assert'
import { test } from 'node:test'

import { bed12 } from './pangenomeGeneModels.ts'
import {
  altTranscriptReader,
  mergeLocusModels,
  nameHits,
  spliced,
  windowHit,
} from './pangenomeLocusGenes.ts'

import type { CatTranscript } from './pangenomeGeneModels.ts'
import type { AltTranscript, WindowHit } from './pangenomeLocusGenes.ts'

const gffRow = (type: string, start: number, end: number, id: string) =>
  [
    'KI270879.1',
    'HAVANA',
    type,
    start,
    end,
    '.',
    '-',
    '.',
    `Parent=${id};transcript_id=${id}`,
  ].join('\t')

test('the exons and CDS of the named alt-contig transcripts are read', () => {
  const r = altTranscriptReader(new Set(['ENST1.1']))
  for (const line of [
    gffRow('transcript', 11, 26, 'ENST1.1'),
    gffRow('exon', 21, 26, 'ENST1.1'),
    gffRow('CDS', 21, 23, 'ENST1.1'),
    gffRow('exon', 11, 14, 'ENST1.1'),
    gffRow('exon', 11, 26, 'ENST2.1'),
  ]) {
    r.add(line)
  }
  assert.deepEqual(
    [...r.transcripts.values()],
    [
      {
        id: 'ENST1.1',
        refName: 'KI270879.1',
        strand: '-',
        exons: [
          [20, 26],
          [10, 14],
        ],
        cds: [[20, 23]],
      },
    ],
  )
})

// a minus-strand transcript whose CDS spans its one intron
const alt: AltTranscript = {
  id: 'ENST1.1',
  refName: 'KI270879.1',
  strand: '-',
  exons: [
    [20, 26],
    [10, 14],
  ],
  cds: [
    [20, 23],
    [12, 14],
  ],
}

test('a minus-strand transcript reads 5′ to 3′, with its CDS in transcript coordinates', () => {
  assert.deepEqual(spliced(alt, 'ACGTNNNNNNGGATCC', 10), {
    bases: 'GGATCCACGT',
    cds: [3, 8],
  })
})

// that transcript spliced onto a window at CM094073.1:1000, reverse strand
const paf = [
  'ENST1.1',
  10,
  0,
  10,
  '-',
  'CM094073.1:1000-2000',
  1000,
  100,
  160,
  10,
  10,
  60,
  'NM:i:0',
  'cg:Z:4M50N6M',
].join('\t')

test('a spliced hit becomes a model in contig coordinates, its exons split at the introns and its CDS mapped through the cigar', () => {
  const hit = windowHit(paf, 'GSTT1', [3, 8])
  assert.equal(
    bed12(hit.model),
    'CM094073.1\t1100\t1160\tGSTT1\t0\t-\t1102\t1157\t0\t2\t4,6\t0,54',
  )
  assert.deepEqual(hit.model.cds, [
    [1102, 1104],
    [1154, 1157],
  ])
  assert.equal(hit.identity, 1)
  assert.equal(hit.coverage, 1)
})

const hit = (
  gene: string,
  start: number,
  end: number,
  identity: number,
  coverage = 1,
): WindowHit => ({
  gene,
  identity,
  coverage,
  model: {
    id: `${gene}@${start}`,
    name: gene,
    refName: 'CM094070.1',
    start,
    end,
    strand: '-',
    exons: [[start, end]],
    cds: [],
    source: gene,
    goodness: identity * 100,
  },
})

test('the best-aligned candidate names a copy, and a copy aligned short or poorly gets no model', () => {
  const named = nameHits([
    hit('KIR2DL3', 105, 195, 0.97),
    hit('KIR2DL2', 100, 200, 0.99),
    hit('KIR2DL2', 500, 600, 0.99, 0.5),
    hit('KIR2DL2', 800, 900, 0.93),
  ])
  assert.deepEqual(
    named.map(h => [h.gene, h.model.start]),
    [['KIR2DL2', 100]],
  )
})

const cat = (name: string, start: number, end: number): CatTranscript => ({
  ...hit(name, start, end, 1).model,
  goodness: 100,
})

test('a locus model replaces the CAT models of its family it overlaps, and no others', () => {
  const merged = mergeLocusModels(
    [
      cat('GSTT2', 2000, 3000),
      cat('LINC01', 2500, 2600),
      cat('GSTT4', 20000, 27000),
    ],
    [{ ...cat('GSTT1', 1000, 9000), locus: 'gstt1' }],
    [
      {
        id: 'gstt1',
        window: { refName: 'chr22', start: 0, end: 1 },
        genes: {},
        replaces: /^GSTT/,
      },
    ],
  )
  assert.deepEqual(
    merged.map(t => t.name),
    ['LINC01', 'GSTT4', 'GSTT1'],
  )
})
