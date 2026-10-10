import assert from 'node:assert'
import { mock, test } from 'node:test'

import {
  checkedSummary,
  choice,
  ensemblSearchUrl,
  fetchReferenceResult,
  identityFromSummary,
  localRef,
  replacementOf,
  resolveGeneIdentity,
  syntenyLaunchUrl,
  kinshipRings,
  trimNeighborhood,
} from './geneHub.ts'
import { leafOrder } from './multiSyntenyTaxonTree.ts'

import type { TaxonNode } from './multiSyntenyTaxonTree.ts'
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

test('localRef resolves a known label, name or taxid without a request', () => {
  assert.equal(localRef('human'), '9606')
  assert.equal(localRef('Homo sapiens'), '9606')
  assert.equal(localRef('fruit fly'), '7227')
  assert.equal(localRef(' 10090 '), '10090')
  assert.equal(localRef('4932'), '559292')
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

// ((((ref, sister), cousins x3), (mouse=10090, rodents x20)), far x30), with
// leaves numbered so the clade each came from reads off the id.
function ringTree(): TaxonNode {
  const leaf = (taxonId: number): TaxonNode => ({
    taxonId,
    name: String(taxonId),
    children: [],
  })
  const node = (taxonId: number, children: TaxonNode[]): TaxonNode => ({
    taxonId,
    name: String(taxonId),
    children,
  })
  const range = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => leaf(from + i))
  return node(1, [
    node(2, [
      node(3, [node(4, [leaf(9606), leaf(500)]), ...range(600, 3)]),
      node(5, [leaf(10090), ...range(700, 20)]),
    ]),
    node(6, range(800, 30)),
  ])
}

test('kinshipRings walks outward from the reference, one clade at a time', () => {
  assert.deepEqual(
    kinshipRings(ringTree(), 9606).map(r => r.length),
    [1, 3, 21, 30],
  )
  assert.deepEqual(kinshipRings(ringTree(), 9606)[0], [500])
})

test('trimNeighborhood keeps close relatives, model organisms and a sample of far clades', () => {
  const tree = ringTree()
  const species = leafOrder(tree).map(taxonId => ({
    taxonId,
    genes: placed(2),
  }))
  const nb = { ...neighborhood(species, 9606), tree }
  const { nb: out, eligible } = trimNeighborhood(nb, 12)
  const kept = out.species.map(s => s.taxonId)
  assert.equal(eligible, 56)
  assert.equal(kept.length, 12)
  for (const t of [9606, 500, 600, 601, 602, 10090]) {
    assert.ok(kept.includes(t), `keeps ${t}`)
  }
  assert.ok(kept.some(t => t >= 700 && t < 800))
  assert.ok(kept.some(t => t >= 800))
  assert.deepEqual(
    kept,
    leafOrder(tree).filter(t => kept.includes(t)),
    'tree order is kept',
  )
})

test('trimNeighborhood without a tree samples the whole list evenly', () => {
  const species = Array.from({ length: 200 }, (_, i) => ({
    taxonId: i,
    genes: placed(2),
  }))
  const { nb: out } = trimNeighborhood(neighborhood(species, 150))
  assert.equal(out.species.length, 80)
  assert.ok(out.species.some(s => s.taxonId === 150))
  assert.ok((out.species[0]?.taxonId ?? 99) < 5)
  assert.ok((out.species.at(-1)?.taxonId ?? 0) > 195)
})

test('syntenyLaunchUrl names a UCSC genome by its db and a GenArk one by accession', () => {
  assert.equal(
    syntenyLaunchUrl(
      { accession: 'GCF_000001405.40', ucscDb: 'hg38' },
      '7157',
      'TP53',
    ),
    '/synteny/?assembly=hg38&gene=7157%3ATP53',
  )
  assert.equal(
    syntenyLaunchUrl({ accession: 'GCF_000003025.6' }, '397413', 'TP53'),
    '/synteny/?assembly=GCF_000003025.6&gene=397413%3ATP53',
  )
})

test('ensemblSearchUrl encodes the symbol', () => {
  assert.equal(
    ensemblSearchUrl('HLA-A'),
    'https://www.ensembl.org/Multi/Search/Results?q=HLA-A;site=ensembl_all',
  )
})

test('a summary NCBI could not build is an error, not a gene card', () => {
  assert.throws(
    () =>
      checkedSummary('999999999', {
        error: 'cannot get document summary',
      }),
    /no record 999999999/,
  )
  assert.throws(() => checkedSummary('1', undefined), /no record 1/)
  assert.equal(checkedSummary('7157', { name: 'TP53' }).name, 'TP53')
})

test('replacementOf reads currentid only when NCBI names a replacement', () => {
  assert.equal(replacementOf({ name: 'LOC102724788', currentid: 5625 }), '5625')
  assert.equal(replacementOf({ name: 'TP53', currentid: '' }), undefined)
  assert.equal(replacementOf({ name: 'X', currentid: 0 }), undefined)
  assert.equal(replacementOf(undefined), undefined)
})

// Answers esummary for each id from the table, so the page's whole resolution
// runs without NCBI. A numeric gene and a numeric ref need no other request.
async function identityWith(summaries: Record<string, object>, gene: string) {
  const original = globalThis.fetch
  mock.method(globalThis, 'fetch', (url: string) => {
    const id = /[?&]id=(\d+)/.exec(url)?.[1] ?? ''
    const body = { result: { uids: [id], [id]: summaries[id] ?? {} } }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  })
  try {
    return await resolveGeneIdentity(gene, '9606')
  } finally {
    globalThis.fetch = original
  }
}

test('a GeneID NCBI does not know rejects', async () => {
  await assert.rejects(
    identityWith(
      { 999999999: { uid: '999999999', error: 'cannot get document summary' } },
      '999999999',
    ),
    /no record 999999999/,
  )
})

test('a replaced GeneID resolves to its replacement', async () => {
  const id = await identityWith(
    {
      102724788: { name: 'LOC102724788', currentid: 5625 },
      5625: {
        name: 'PRODH',
        description: 'proline dehydrogenase 1',
        currentid: '',
        organism: { scientificname: 'Homo sapiens', taxid: 9606 },
      },
    },
    '102724788',
  )
  assert.equal(id.geneId, '5625')
  assert.equal(id.symbol, 'PRODH')
})

// A table scoped to fish has no human row, and the Synteny launch lost the
// genome it opens on with it. The reference row is asked for on its own,
// scoped to the gene's own taxon, and names the hosted genome.
test('the reference row is fetched scoped to its own taxon', async () => {
  const asked: string[] = []
  const original = globalThis.fetch
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  mock.method(globalThis, 'fetch', (url: string) => {
    asked.push(url)
    return url.endsWith('/ortholog_index.json')
      ? json({
          schema: 'ortholog-index/2',
          accessions: ['GCF_000001405.40'],
          ucscDb: { 'GCF_000001405.40': 'hg38' },
        })
      : json({
          reports: [
            {
              gene: {
                gene_id: '7157',
                symbol: 'TP53',
                tax_id: 9606,
                taxname: 'Homo sapiens',
                annotations: [
                  {
                    assembly_accession: 'GCF_000001405.40',
                    genomic_locations: [
                      {
                        genomic_accession_version: 'NC_000017.11',
                        sequence_name: '17',
                        genomic_range: { begin: '7668421', end: '7687490' },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        })
  })
  try {
    const row = await fetchReferenceResult('7157', 9606)
    assert.equal(row?.assembly.ucscDb, 'hg38')
    const scoped =
      '/gene/id/7157/orthologs?returned_content=COMPLETE&taxon_filter=9606'
    assert.ok(asked.some(u => u.endsWith(scoped)))
  } finally {
    globalThis.fetch = original
  }
})
