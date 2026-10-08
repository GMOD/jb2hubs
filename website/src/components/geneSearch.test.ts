import assert from 'node:assert'
import { mock, test } from 'node:test'

import {
  dedupeHits,
  encodeGeneRef,
  pairGenes,
  parseGeneRef,
  queryGenes,
  rankSymbols,
  searchGenes,
} from './geneSearch.ts'

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

// A synteny link carries the picked gene as one query parameter, and a load
// needs both halves back: the id to resolve the ortholog, the symbol to show.
test('gene ref: round-trips id and symbol, with a colon in the symbol', () => {
  const ref = encodeGeneRef('7157', 'TP53')
  assert.equal(ref, '7157:TP53')
  assert.deepEqual(parseGeneRef(ref), { geneId: '7157', symbol: 'TP53' })
  assert.deepEqual(parseGeneRef('12:A:B'), { geneId: '12', symbol: 'A:B' })
})

test('gene ref: anything else is not a gene', () => {
  assert.equal(parseGeneRef(''), undefined)
  assert.equal(parseGeneRef('TP53'), undefined)
  assert.equal(parseGeneRef('7157:'), undefined)
})

// An outage and "no gene starts with that" both come back as an empty list
// from the best-effort search, which is what the synteny picker used to show
// as "No results found". The strict query keeps them apart.
test('queryGenes rejects on a failed request; searchGenes swallows it', async () => {
  const failing = mock.method(globalThis, 'fetch', () =>
    Promise.resolve(new Response('', { status: 429 })),
  )
  try {
    await assert.rejects(queryGenes('TP5', 9606), /429/)
    assert.deepEqual(await searchGenes('TP5', 9606), [])
  } finally {
    failing.mock.restore()
  }
})

// NCBI's ortholog report for TP53 filtered to human and mouse, trimmed to the
// fields the picker reads (measured 2026-10-08).
const TP53_REPORTS = [
  {
    gene: {
      gene_id: '7157',
      symbol: 'TP53',
      tax_id: '9606',
      annotations: [
        {
          assembly_accession: 'GCF_000001405.40',
          genomic_locations: [
            {
              genomic_accession_version: 'NC_000017.11',
              sequence_name: '17',
              genomic_range: {
                begin: '7668421',
                end: '7687490',
                orientation: 'minus',
              },
            },
          ],
        },
        {
          assembly_accession: 'GCF_009914755.1',
          genomic_locations: [
            {
              genomic_accession_version: 'NC_060941.1',
              sequence_name: '17',
              genomic_range: {
                begin: '7572544',
                end: '7591594',
                orientation: 'minus',
              },
            },
          ],
        },
      ],
    },
  },
  {
    gene: {
      gene_id: '22059',
      symbol: 'Trp53',
      tax_id: '10090',
      annotations: [
        {
          assembly_accession: 'GCF_000001635.27',
          genomic_locations: [
            {
              genomic_accession_version: 'NC_000077.7',
              sequence_name: '11',
              genomic_range: {
                begin: '69471174',
                end: '69482699',
                orientation: 'plus',
              },
            },
          ],
        },
      ],
    },
  },
]

// A swap makes the ortholog the first assembly's gene, so the pair has to
// carry its id as well as its symbol.
test('pairGenes: the gene and its ortholog, ids and all', () => {
  const { gene, ortholog } = pairGenes(TP53_REPORTS.toReversed(), '7157', false)
  assert.equal(gene?.symbol, 'TP53')
  assert.deepEqual([ortholog?.gene_id, ortholog?.symbol], ['22059', 'Trp53'])
})

test('pairGenes: in one taxon the gene is its own ortholog', () => {
  const { gene, ortholog } = pairGenes(TP53_REPORTS.slice(0, 1), '7157', true)
  assert.equal(ortholog, gene)
})

test('pairGenes: no ortholog in the partner taxon', () => {
  assert.equal(
    pairGenes(TP53_REPORTS.slice(0, 1), '7157', false).ortholog,
    undefined,
  )
})
