import assert from 'node:assert'
import { test } from 'node:test'

import { codingExtents } from './codingExtent.ts'
import { longOutliers } from './neighborhood.ts'

import type { OrthologRow } from './orthologSet.ts'

const exons = (strand: string, list: [number, number][]) =>
  list.map(([begin, end], i) => ({
    begin: String(begin),
    end: String(end),
    orientation: strand,
    order: i + 1,
  }))

const cds = (begin: number, end: number) => ({
  range: [{ begin: String(begin), end: String(end) }],
})

// Human OR51B5 (NCBI Gene 282763): NM_001005567 starts 160 kb upstream of the
// one coding exon that NM_001395252 is made of alone.
const or51b5 = {
  product: {
    gene_id: '282763',
    transcripts: [
      {
        cds: cds(444, 1382),
        genomic_locations: [
          {
            genomic_accession_version: 'NC_000011.10',
            exons: exons('minus', [
              [5505569, 5505652],
              [5346876, 5346910],
              [5346262, 5346353],
              [5345773, 5345899],
              [5342514, 5343629],
            ]),
          },
        ],
      },
      {
        genomic_locations: [
          {
            genomic_accession_version: 'NC_000011.10',
            exons: exons('minus', [
              [5505569, 5505652],
              [5340318, 5341362],
            ]),
          },
        ],
      },
    ],
  },
}

// Bornean orangutan HBE1: the predicted model's first exon sits 249 kb upstream.
const hbe1 = {
  product: {
    gene_id: '129008870',
    transcripts: [
      {
        cds: cds(239, 817),
        genomic_locations: [
          {
            genomic_accession_version: 'NC_072382.2',
            exons: exons('plus', [
              [70737613, 70737676],
              [70974947, 70974989],
              [70986683, 70987040],
              [70987163, 70987385],
              [70988250, 70988502],
            ]),
          },
        ],
      },
    ],
  },
}

test('a minus-strand CDS maps through the exons in transcript order', () => {
  const out = codingExtents([or51b5], new Map([['282763', 'NC_000011.10']]))
  assert.deepStrictEqual(out.get('282763'), { start: 5342586, end: 5343524 })
})

test('a plus-strand CDS skips the far-off UTR exons', () => {
  const out = codingExtents([hbe1], new Map([['129008870', 'NC_072382.2']]))
  assert.deepStrictEqual(out.get('129008870'), {
    start: 70986814,
    end: 70988378,
  })
})

test('a gene placed on another sequence gets no extent', () => {
  const out = codingExtents([hbe1], new Map([['129008870', 'NC_000001.1']]))
  assert.strictEqual(out.size, 0)
})

test('longOutliers keeps orthologs over twice the median span', () => {
  const row = (geneId: string, span: number) =>
    ({ geneId, start: 1000, end: 1000 + span }) as OrthologRow
  const rows = [
    row('a', 1500),
    row('b', 1600),
    row('c', 1700),
    row('d', 250_000),
  ]
  assert.deepStrictEqual(
    longOutliers(rows).map(r => r.geneId),
    ['d'],
  )
})
