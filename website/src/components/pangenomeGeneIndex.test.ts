import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  indexedGeneRegion,
  indexedSymbols,
  parseRecord,
} from './pangenomeGeneIndex.ts'
import { GENE_FLANK_BP } from './pangenomeRegion.ts'

// Records as the hosted indexes hold them (hg38, TAIR10.1; 2026-11-02).
const ERBB2_NCBI =
  '["NC_000017.11%3A39688094..39728658"|"hg38-ncbiRefSeqGff"|"ERBB2"|"gene-ERBB2"|"CD340%20HER-2%20HER2%20NEU"]'
const ERBB2_UCSC =
  '["chr17%3A39688094..39728658"|"hg38-ncbiRefSeq"|"ERBB2"|"ERBB2"]'
const ERBB2_TRANSCRIPT =
  '["chr17%3A39688094..39717657"|"hg38-ncbiRefSeq"|"NM_001289938.2"|"NM_001289938.2"|"CD340%20HER-2%20HER2%20NEU"]'
const C4A_ALT =
  '["chr6_GL000252v2_alt%3A3229830..3250455"|"hg38-ncbiRefSeq"|"C4A"|"C4A"]'
const C4A = '["chr6%3A31982057..32002681"|"hg38-ncbiRefSeq"|"C4A"|"C4A"]'
const FLC =
  '["NC_003076.8%3A3173382..3179448"|"GCF_000001735.4-ncbiGff"|"FLC"|"gene-AT5G10140"|"AGL25%20FLF"]'

const HG38 = [
  { name: 'chr6', length: 170_805_979 },
  { name: 'chr17', length: 83_257_441 },
]
const TAIR = [{ name: 'Chr5', length: 26_975_502, aliases: ['NC_003076.8'] }]

function index(terms: Record<string, string[]>) {
  const asked: string[] = []
  const search = async (term: string) => {
    asked.push(term)
    return (terms[term] ?? []).map(record => [term, record] as const)
  }
  return { asked, search }
}

test('a record is its 1-based span, name, id and synonyms', () => {
  assert.deepEqual(parseRecord(ERBB2_NCBI), {
    name: 'ERBB2',
    id: 'gene-ERBB2',
    aliases: ['CD340', 'HER-2', 'HER2', 'NEU'],
    chrom: 'NC_000017.11',
    start: 39_688_093,
    end: 39_728_658,
  })
})

test('a symbol lands on the sequence the graph holds, with flanks', async () => {
  const { search, asked } = index({ c4a: [C4A_ALT, C4A] })
  assert.deepEqual(await indexedGeneRegion(search, 'C4A', HG38), {
    chrom: 'chr6',
    start: 31_982_056 - GENE_FLANK_BP,
    end: 32_002_681 + GENE_FLANK_BP,
    symbol: 'C4A',
    gene: { start: 31_982_056, end: 32_002_681 },
  })
  assert.deepEqual(asked, ['c4a'])
})

test("a synonym opens its gene's own span, not a transcript that lists it", async () => {
  const { search } = index({
    her2: [ERBB2_NCBI, ERBB2_TRANSCRIPT],
    erbb2: [ERBB2_NCBI, ERBB2_UCSC],
  })
  const region = await indexedGeneRegion(search, 'her2', HG38)
  assert.deepEqual(
    [region?.symbol, region?.gene],
    ['ERBB2', { start: 39_688_093, end: 39_728_658 }],
  )
})

test("an NCBI gene id finds the gene where only the id is indexed, under the graph's name", async () => {
  const { search } = index({ 'gene-at5g10140': [FLC] })
  const region = await indexedGeneRegion(search, 'AT5G10140', TAIR)
  assert.deepEqual([region?.chrom, region?.symbol], ['Chr5', 'FLC'])
})

test('a gene on no sequence the graph holds is no window', async () => {
  const { search } = index({ c4a: [C4A_ALT] })
  assert.equal(await indexedGeneRegion(search, 'C4A', HG38), undefined)
})

test('suggestions are the gene symbols the index starts with the text, once each', async () => {
  const { search } = index({ erb: [ERBB2_NCBI, ERBB2_UCSC, ERBB2_TRANSCRIPT] })
  assert.deepEqual(await indexedSymbols(search, 'erb'), ['ERBB2'])
})
