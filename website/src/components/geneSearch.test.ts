import assert from 'node:assert'
import { test } from 'node:test'

import { dedupeHits, rankSymbols } from './geneSearch.ts'

// mygene's prefix search does not lead with the obvious answer: `symbol:TP5*` in
// human returns TP53TG3C, TP53TG1, TP53RK and buries TP53, so a reader typing
// "TP5" would not see the gene they meant in the list.
test('rankSymbols: the exact match leads, then the shortest', () => {
  assert.deepEqual(
    rankSymbols(['TP53TG3C', 'TP53TG1', 'TP53RK', 'TP53', 'TP53I11'], 'TP53'),
    ['TP53', 'TP53RK', 'TP53I11', 'TP53TG1', 'TP53TG3C'],
  )
})

test('rankSymbols: with no exact match, shortest first', () => {
  assert.deepEqual(rankSymbols(['TP53TG1', 'TP53RK'], 'TP5'), [
    'TP53RK',
    'TP53TG1',
  ])
})

// Species differ in how they case symbols (TP53 / Trp53 / tp53), and someone
// typing lowercase still means the gene.
test('rankSymbols: the exact match is case-insensitive', () => {
  assert.equal(rankSymbols(['shhb', 'shha'], 'SHHA')[0], 'shha')
})

test('rankSymbols: equal-length siblings keep a stable alphabetical order', () => {
  assert.deepEqual(rankSymbols(['CDC8', 'CDC3', 'CDC1'], 'CDC'), [
    'CDC1',
    'CDC3',
    'CDC8',
  ])
})

test('rankSymbols: duplicates collapse', () => {
  assert.deepEqual(rankSymbols(['AG', 'AG', 'AGL'], 'AG'), ['AG', 'AGL'])
})

// mygene returns a record per source, so a symbol both Ensembl and NCBI know
// comes back twice — and only one of the two carries an `entrezgene`. The
// synteny picker resolves its second-species ortholog by that id, so taking
// whichever came first would half the time offer a suggestion it cannot follow.
test('dedupeHits: one hit per symbol, keeping the one with a gene id', () => {
  assert.deepEqual(
    dedupeHits([
      { symbol: 'BRCA1P1' },
      { symbol: 'BRCA1P1', entrezgene: '394269' },
      { symbol: 'BRCA1', entrezgene: '672' },
    ]),
    [
      { symbol: 'BRCA1P1', geneId: '394269' },
      { symbol: 'BRCA1', geneId: '672' },
    ],
  )
})

test('dedupeHits: an id-bearing hit is not displaced by a later bare one', () => {
  assert.deepEqual(
    dedupeHits([{ symbol: 'TP53', entrezgene: 7157 }, { symbol: 'TP53' }]),
    [{ symbol: 'TP53', geneId: '7157' }],
  )
})

// mygene types entrezgene as a number for some records and a string for others;
// the id is concatenated into an NCBI url either way.
test('dedupeHits: a numeric entrezgene becomes a string', () => {
  assert.equal(
    dedupeHits([{ symbol: 'TP53', entrezgene: 7157 }])[0]?.geneId,
    '7157',
  )
})

// A record with no entrezgene anywhere is still a real suggestion for the
// protein browser, which only needs the symbol — it is the synteny picker that
// filters these out.
test('dedupeHits: a symbol with no id at all survives, without one', () => {
  assert.deepEqual(dedupeHits([{ symbol: 'BRCA1P1' }]), [
    { symbol: 'BRCA1P1', geneId: undefined },
  ])
})
