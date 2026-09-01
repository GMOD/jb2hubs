import assert from 'node:assert'
import { test } from 'node:test'

import {
  choice,
  ensemblSearchUrl,
  identityFromSummary,
  localRef,
  syntenyLaunchUrl,
  trimNeighborhood,
} from './geneHub.ts'

import type { Neighborhood, PlacedGene, SpeciesRow } from './neighborhood.ts'

function placed(n: number): PlacedGene[] {
  return Array.from({ length: n }, (_, i) => ({
    anchorId: `a${i}`,
    symbol: `G${i}`,
    assembly: 'GCF_1',
    refName: 'NC_1',
    chromosome: '1',
    start: i * 10,
    end: i * 10 + 5,
    strand: 1,
  }))
}

function neighborhood(species: SpeciesRow[], refTaxonId: number): Neighborhood {
  return {
    query: { geneId: '1', symbol: 'X', refTaxonId },
    anchors: [],
    species,
  }
}

test('identityFromSummary reads the fields the header shows and trusts the gene’s own organism', () => {
  const id = identityFromSummary('trp53', 9606, '22059', {
    name: 'Trp53',
    description: 'transformation related protein 53',
    maplocation: '11 B2',
    otheraliases: 'Tp53, bbl, bfy',
    organism: {
      scientificname: 'Mus musculus',
      commonname: 'house mouse',
      taxid: 10090,
    },
  })
  assert.deepEqual(id, {
    geneId: '22059',
    symbol: 'Trp53',
    description: 'transformation related protein 53',
    mapLocation: '11 B2',
    aliases: ['Tp53', 'bbl', 'bfy'],
    species: 'Mus musculus',
    commonName: 'house mouse',
    refTaxId: 10090,
  })
})

test('identityFromSummary falls back to what was typed and the typed taxon', () => {
  const id = identityFromSummary('BRCA1', 9606, '672', {})
  assert.equal(id.symbol, 'BRCA1')
  assert.equal(id.refTaxId, 9606)
  assert.deepEqual(id.aliases, [])
})

test('localRef resolves a known label or a taxid without a request', () => {
  assert.equal(localRef('human'), '9606')
  assert.equal(localRef(' 10090 '), '10090')
  assert.equal(localRef('axolotl'), 'axolotl')
})

test('choice accepts only a listed value', () => {
  assert.equal(choice([7, 11], '11', 7), 11)
  assert.equal(choice([7, 11], '12', 7), 7)
  assert.equal(choice([7, 11], '', 7), 7)
})

test('trimNeighborhood drops rows with one anchor and keeps the rest in order', () => {
  const nb = neighborhood(
    [
      { taxonId: 1, genes: placed(1) },
      { taxonId: 2, genes: placed(3) },
      { taxonId: 3, genes: placed(2) },
    ],
    2,
  )
  const { nb: out, eligible } = trimNeighborhood(nb)
  assert.deepEqual(
    out.species.map(s => s.taxonId),
    [2, 3],
  )
  assert.equal(eligible, 2)
})

test('trimNeighborhood centers the window on the reference when over the cap', () => {
  const species = Array.from({ length: 200 }, (_, i) => ({
    taxonId: i,
    genes: placed(2),
  }))
  const { nb: out, eligible } = trimNeighborhood(neighborhood(species, 150))
  assert.equal(eligible, 200)
  assert.equal(out.species.length, 80)
  assert.equal(out.species[0]?.taxonId, 110)
  assert.ok(out.species.some(s => s.taxonId === 150))
  const tail = trimNeighborhood(neighborhood(species, 199))
  assert.equal(tail.nb.species[0]?.taxonId, 120)
  assert.equal(tail.nb.species.at(-1)?.taxonId, 199)
})

test('syntenyLaunchUrl names a UCSC genome by its db and a GenArk one by accession', () => {
  assert.equal(
    syntenyLaunchUrl(
      { accession: 'GCF_000001405.40', ucscDb: 'hg38' },
      '7157',
      'TP53',
    ),
    '/synteny?assembly=hg38&gene=7157%3ATP53',
  )
  assert.equal(
    syntenyLaunchUrl({ accession: 'GCF_000003025.6' }, '397413', 'TP53'),
    '/synteny?assembly=GCF_000003025.6&gene=397413%3ATP53',
  )
})

test('ensemblSearchUrl encodes the symbol', () => {
  assert.equal(
    ensemblSearchUrl('HLA-A'),
    'https://www.ensembl.org/Multi/Search/Results?q=HLA-A;site=ensembl_all',
  )
})
