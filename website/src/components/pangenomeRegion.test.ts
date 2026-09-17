import assert from 'node:assert'
import { test } from 'node:test'

import {
  GENE_FLANK_BP,
  formatRegion,
  parseRegion,
  resolveRegion,
} from './pangenomeRegion.ts'

test('a locstring is read the way a browser shows it, and comes back 0-based', () => {
  assert.deepEqual(parseRegion('chr1:196,740,001-196,850,000'), {
    chrom: 'chr1',
    start: 196_740_000,
    end: 196_850_000,
  })
  assert.deepEqual(parseRegion(' chr6 : 32510001 .. 32600000 '), {
    chrom: 'chr6',
    start: 32_510_000,
    end: 32_600_000,
  })
  assert.equal(
    formatRegion({ chrom: 'chr1', start: 196_740_000, end: 196_850_000 }),
    'chr1:196,740,001-196,850,000',
  )
})

test('what is not a region is left for a gene lookup', () => {
  assert.equal(parseRegion('CFH'), undefined)
  assert.equal(parseRegion('chr1:200-100'), undefined)
  assert.equal(parseRegion('chr1:100'), undefined)
})

test('a gene comes back as its span with flanks', async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        hits: [
          {
            symbol: 'CFH',
            genomic_pos: { chr: '1', start: 196_652_043, end: 196_747_504 },
          },
        ],
      }),
    )) as unknown as typeof fetch
  assert.deepEqual(await resolveRegion('CFH', 9606, fetchImpl), {
    chrom: 'chr1',
    start: 196_652_042 - GENE_FLANK_BP,
    end: 196_747_504 + GENE_FLANK_BP,
  })
})

test('a gene placed on no plain chromosome is no window', async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        hits: [
          { symbol: 'X', genomic_pos: { chr: 'KI270713.1', start: 1, end: 2 } },
        ],
      }),
    )) as unknown as typeof fetch
  assert.equal(await resolveRegion('X', 9606, fetchImpl), undefined)
})
