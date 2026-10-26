import assert from 'node:assert'
import { test } from 'node:test'

import { buildTaxonomyIndex, parseTaxonomyNewick } from './taxonomyCache.ts'
import { ucscDbsByTaxon } from './ucscClades.ts'

import type { UcscListEntry } from './hubListings.ts'

const NEWICK =
  '((Homo sapiens[GCF_000001405.40|9606]:1.0,Pan troglodytes[GCF_028858775.2|9598]:1.0)Hominidae{9604}:1.0,Mus musculus[GCF_000001635.27|10090]:1.0)Mammalia{40674};'

function entry(taxId: number, orderKey: number): UcscListEntry {
  return { description: '', organism: '', scientificName: '', taxId, orderKey }
}

function byTaxon() {
  const tree = parseTaxonomyNewick(NEWICK)
  assert.ok(tree)
  return ucscDbsByTaxon(
    buildTaxonomyIndex(tree),
    {
      hg19: entry(9606, 2),
      hg38: entry(9606, 1),
      mm39: entry(10090, 3),
      papHam1: entry(9562, 4),
    },
    new Map([['hg38', ['GCF_000001405.40']]]),
  )
}

const dbs = (rows: { db: string }[] | undefined) => rows?.map(r => r.db)

test('a db sits under its own taxon and every ancestor, in UCSC order', () => {
  const map = byTaxon()
  assert.deepEqual(dbs(map.get('9606')), ['hg38', 'hg19'])
  assert.deepEqual(dbs(map.get('9604')), ['hg38', 'hg19'])
  assert.deepEqual(dbs(map.get('40674')), ['hg38', 'hg19', 'mm39'])
  assert.equal(map.get('9598'), undefined)
})

test('a db whose taxon the tree lacks sits under none', () => {
  const all = [...byTaxon().values()].flat()
  assert.ok(!all.some(row => row.db === 'papHam1'))
})

test('a db keeps its GenArk accessions, and one GenArk lacks has none', () => {
  const [hg38, hg19] = byTaxon().get('9606')!
  assert.deepEqual(hg38?.accessions, ['GCF_000001405.40'])
  assert.deepEqual(hg19?.accessions, [])
})
