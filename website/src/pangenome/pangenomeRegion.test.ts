import assert from 'node:assert'
import { test } from 'node:test'

import {
  formatRegion,
  matchRefName,
  parseRegion,
  placeRegion,
  resolveRegion,
  sequenceNames,
  wholeSequence,
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

test('a start at or before the first base clamps to it', () => {
  assert.deepEqual(parseRegion('chr1:0-1,000'), {
    chrom: 'chr1',
    start: 0,
    end: 1000,
  })
})

test('a chromosome is named the way the file names it, or not at all', () => {
  const known = ['chr1', 'chrX', 'chrM']
  assert.equal(matchRefName('chr1', known), 'chr1')
  assert.equal(matchRefName('1', known), 'chr1')
  assert.equal(matchRefName('x', known), 'chrX')
  assert.equal(matchRefName('MT', known), 'chrM')
  assert.equal(matchRefName('chr99', known), undefined)
  assert.equal(matchRefName('chr3', ['Chr3']), 'Chr3')
})

test('a region lands on the graphs own sequence, cut to its length', () => {
  const sequences = [{ name: 'Chr3', length: 1000 }]
  assert.deepEqual(
    placeRegion({ chrom: 'chr3', start: 900, end: 5000 }, sequences),
    { chrom: 'Chr3', start: 900, end: 1000 },
  )
  assert.equal(
    placeRegion({ chrom: 'chr3', start: 1000, end: 5000 }, sequences),
    undefined,
  )
  assert.equal(
    placeRegion({ chrom: 'chr9', start: 0, end: 10 }, sequences),
    undefined,
  )
})

test("a region named the way the reference's gene files name its sequence lands on the graph's", () => {
  const sequences = [{ name: 'Chr1', length: 1000, aliases: ['NC_003070.9'] }]
  assert.deepEqual(
    placeRegion({ chrom: 'NC_003070.9', start: 10, end: 20 }, sequences),
    { chrom: 'Chr1', start: 10, end: 20 },
  )
  assert.deepEqual(sequenceNames('Chr1', sequences), ['Chr1', 'NC_003070.9'])
  assert.deepEqual(sequenceNames('chr6', [{ name: 'chr6', length: 1 }]), [
    'chr6',
  ])
})

test('a bare sequence name is the whole sequence', () => {
  const sequences = [{ name: 'chr6', length: 1000 }]
  assert.deepEqual(wholeSequence(' 6 ', sequences), {
    chrom: 'chr6',
    start: 0,
    end: 1000,
  })
  assert.equal(wholeSequence('CFH', sequences), undefined)
})

test('what is not a region is left for a gene lookup', () => {
  assert.equal(parseRegion('CFH'), undefined)
  assert.equal(parseRegion('chr1:200-100'), undefined)
  assert.equal(parseRegion('chr1:100'), undefined)
})

test('a locstring is a region, other text is a gene the lookup places', async () => {
  const asked: string[] = []
  const lookup = async (symbol: string) => {
    asked.push(symbol)
    return { chrom: 'chr1', start: 0, end: 10, symbol: 'CFH' }
  }
  assert.deepEqual(await resolveRegion('chr1:11-20', lookup), {
    chrom: 'chr1',
    start: 10,
    end: 20,
  })
  assert.equal((await resolveRegion(' CFH ', lookup))?.symbol, 'CFH')
  assert.equal(await resolveRegion('   ', lookup), undefined)
  assert.deepEqual(asked, ['CFH'])
})
