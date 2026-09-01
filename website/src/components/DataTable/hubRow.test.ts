import assert from 'node:assert'
import { test } from 'node:test'

import { IS_REFERENCE, IS_SUPPRESSED } from '../../lib/searchIndex.ts'
import {
  INLINE_ACCESSION_LIMIT,
  byCommonName,
  categoryTable,
  decodeHubRow,
  encodeHubRow,
  subtreeTable,
  taxonAccessionsUrl,
  toRowData,
} from './hubRow.ts'

import type { HubSource } from './hubRow.ts'

const human: HubSource = {
  accession: 'GCF_000001405.40',
  commonName: 'human (GRCh38.p14 2022)',
  scientificName: 'Homo sapiens',
  ncbiAssemblyName: 'GRCh38.p14',
  assemblyStatus: 'Chromosome',
  seqReleaseDate: '2022-02-03',
  taxonId: 9606,
  submitterOrg: 'GRC',
  ncbiRefSeqCategory: 'reference genome',
  source: 'primates',
}

// The wire format is a positional array, so an insertion anywhere in
// encodeHubRow silently shifts every later field into the wrong column of the
// table rather than failing. This is what notices.
test('encode/decode round-trips every field', () => {
  assert.deepEqual(toRowData(human), {
    accession: 'GCF_000001405.40',
    commonName: 'human (GRCh38.p14 2022)',
    scientificName: 'Homo sapiens',
    ncbiAssemblyName: 'GRCh38.p14',
    assemblyStatus: 'Chromosome',
    seqReleaseDate: '2022-02-03',
    taxonId: 9606,
    submitterOrg: 'GRC',
    ncbiStatus: IS_REFERENCE,
  })
})

test('null and absent fields become empty strings, not "null"', () => {
  const row = toRowData({ accession: 'GCA_000000001.1', commonName: null })
  assert.equal(row.commonName, '')
  assert.equal(row.scientificName, '')
  assert.equal(row.submitterOrg, '')
  assert.equal(row.taxonId, 0)
})

test('ncbiStatus packs reference and suppressed independently', () => {
  const status = (s: Partial<HubSource>) =>
    encodeHubRow({ accession: 'x', ...s })[8]
  assert.equal(status({}), 0)
  assert.equal(status({ ncbiRefSeqCategory: 'reference genome' }), IS_REFERENCE)
  assert.equal(status({ suppressed: true }), IS_SUPPRESSED)
  assert.equal(
    status({ ncbiRefSeqCategory: 'reference genome', suppressed: true }),
    IS_REFERENCE | IS_SUPPRESSED,
  )
  // Only the exact category counts — "representative genome" is not a reference.
  assert.equal(status({ ncbiRefSeqCategory: 'representative genome' }), 0)
})

test('decodeHubRow reads the same positions encodeHubRow writes', () => {
  assert.deepEqual(decodeHubRow(encodeHubRow(human)), toRowData(human))
})

const rows: HubSource[] = [
  { accession: 'GCA_3', commonName: 'zebra', source: 'mammals' },
  { accession: '', commonName: 'no accession', source: 'mammals' },
  { accession: 'GCA_1', commonName: 'aardvark', source: 'mammals' },
  { accession: 'GCA_2', commonName: 'mouse', source: 'vertebrate' },
]

test('byCommonName is the order both the generator and the pages use', () => {
  const names = [...rows].sort(byCommonName).map(r => r.commonName)
  assert.deepEqual(names, ['aardvark', 'mouse', 'no accession', 'zebra'])
})

test('categoryTable drops accession-less rows and names its one data file', () => {
  const table = categoryTable('mammals', rows)
  assert.deepEqual(table.dataUrls, ['/hubData/mammals.json'])
  assert.equal(table.totalRows, 3)
  assert.deepEqual(
    table.initialRows.map(r => r.commonName),
    ['aardvark', 'mouse', 'zebra'],
  )
  // A subtree narrows a category file; a whole category does not.
  assert.equal(table.accessions, undefined)
})

test('subtreeTable pulls every category its rows came from, deduped', () => {
  const table = subtreeTable(rows)
  assert.deepEqual(table.dataUrls.sort(), [
    '/hubData/mammals.json',
    '/hubData/vertebrate.json',
  ])
  assert.equal(table.totalRows, 3)
  // Three rows fit in the first page, so the table already has the whole
  // subtree and nothing narrows anything.
  assert.equal(table.accessions, undefined)
  assert.equal(table.accessionsUrl, undefined)
})

function manyRows(n: number): HubSource[] {
  return Array.from({ length: n }, (_, i) => ({
    accession: `GCA_${i}`,
    commonName: `species ${i}`,
    source: 'bacteria',
  }))
}

test('a subtree past the first page carries the accession list that narrows the category file', () => {
  const table = subtreeTable(manyRows(300))
  assert.equal(table.initialRows.length, 200)
  assert.equal(table.accessions?.length, 300)
  assert.equal(table.accessionsUrl, undefined)
})

test('a large subtree names its list file instead of inlining it', () => {
  const url = taxonAccessionsUrl('2')
  assert.equal(url, '/hubData/taxon/2.json')
  const table = subtreeTable(manyRows(INLINE_ACCESSION_LIMIT + 1), url)
  assert.equal(table.accessions, undefined)
  assert.equal(table.accessionsUrl, url)
  // Without a file to name, the list is inlined however large it is: a table
  // that cannot narrow would show the whole category.
  assert.equal(
    subtreeTable(manyRows(INLINE_ACCESSION_LIMIT + 1)).accessions?.length,
    INLINE_ACCESSION_LIMIT + 1,
  )
})

test('a server-rendered first page decodes to exactly what the wire will replace it with', () => {
  const table = categoryTable('mammals', rows)
  const overWire = rows
    .filter(r => r.accession)
    .sort(byCommonName)
    .map(encodeHubRow)
    .map(decodeHubRow)
  assert.deepEqual(table.initialRows, overWire)
})
