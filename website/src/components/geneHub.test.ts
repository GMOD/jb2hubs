import assert from 'node:assert'
import { mock, test } from 'node:test'

import {
  choice,
  ensemblSearchUrl,
  ensemblUrl,
  fetchReferenceResult,
  identityFromReport,
  localRef,
  previewOrthologs,
  resolveGeneIdentity,
  syntenyLaunchUrl,
  uniprotUrl,
} from './geneHub.ts'

import type { OrthologResult } from './orthologResults.ts'

test('identityFromReport reads the fields the header shows and trusts the gene’s own organism', () => {
  const id = identityFromReport('trp53', 9606, {
    gene_id: '22059',
    symbol: 'Trp53',
    description: 'transformation related protein 53',
    map_locations: [
      { map_type: 'Genetic', map_value: '11 43.6 cM' },
      { map_type: 'Cytogenetic', map_value: '11 B2' },
    ],
    synonyms: ['Tp53', 'bbl', 'bfy'],
    taxname: 'Mus musculus',
    common_name: 'house mouse',
    tax_id: '10090',
    ensembl_gene_ids: ['ENSMUSG00000059552'],
    swiss_prot_accessions: ['P02340'],
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
    ensemblGeneId: 'ENSMUSG00000059552',
    uniprotAccession: 'P02340',
  })
})

test('identityFromReport falls back to what was typed and the typed taxon', () => {
  const id = identityFromReport('BRCA1', 9606, { gene_id: '672' })
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

// Answers Datasets' gene-by-id report from the table, keyed by the id asked
// for, so the page's whole resolution runs without NCBI. A numeric gene and a
// numeric ref need no other request.
async function identityWith(reports: Record<string, object>, gene: string) {
  const asked: string[] = []
  const original = globalThis.fetch
  mock.method(globalThis, 'fetch', (url: string) => {
    asked.push(url)
    const id = /\/gene\/id\/(\d+)/.exec(url)?.[1] ?? ''
    const report = reports[id]
    const body = report ? { reports: [{ gene: report }] } : {}
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  })
  try {
    return { identity: await resolveGeneIdentity(gene, '9606'), asked }
  } finally {
    globalThis.fetch = original
  }
}

test('a GeneID NCBI does not know rejects', async () => {
  await assert.rejects(identityWith({}, '999999999'), /no record 999999999/)
})

// Datasets follows the replacement itself: asked for 102724788 it answers
// with 5625, so the page asks once and names the gene the report names.
test('a replaced GeneID resolves to its replacement in one request', async () => {
  const { identity, asked } = await identityWith(
    {
      102724788: {
        gene_id: '5625',
        symbol: 'PRODH',
        description: 'proline dehydrogenase 1',
        tax_id: '9606',
        taxname: 'Homo sapiens',
      },
    },
    '102724788',
  )
  assert.equal(identity.geneId, '5625')
  assert.equal(identity.symbol, 'PRODH')
  assert.equal(asked.length, 1)
})

test('ensemblUrl opens an ENS id directly and searches anything else', () => {
  assert.equal(
    ensemblUrl({ symbol: 'TP53', ensemblGeneId: 'ENSG00000141510' }),
    'https://www.ensembl.org/id/ENSG00000141510',
  )
  assert.equal(
    ensemblUrl({ symbol: 'AP1', ensemblGeneId: 'AT1G69120' }),
    ensemblSearchUrl('AT1G69120'),
  )
  assert.equal(ensemblUrl({ symbol: 'TP53' }), ensemblSearchUrl('TP53'))
  assert.equal(
    uniprotUrl('P04637'),
    'https://www.uniprot.org/uniprotkb/P04637/entry',
  )
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

function row(accession: string, taxonId: number): OrthologResult {
  return {
    assembly: { accession, scientificName: accession, taxonId },
    geneSymbol: 'X',
    geneId: '1',
    chromosome: '1',
    refName: 'NC_1',
    begin: 1,
    end: 2,
    strand: 1,
    jbrowseUrl: '',
  }
}

test('previewOrthologs leads with the model organisms, skips the reference and fills from the lead group', () => {
  const human = row('GCF_H', 9606)
  const mouse = row('GCF_M', 10090)
  const zebrafish = row('GCF_Z', 7955)
  const others = Array.from({ length: 10 }, (_, i) => row(`GCF_${i}`, 500 + i))
  const results = [human, mouse, zebrafish, ...others]
  const picked = previewOrthologs(results, 'GCF_H', [human, others[9]!, mouse])
  assert.deepEqual(
    picked.map(r => r.assembly.accession),
    ['GCF_M', 'GCF_Z', 'GCF_9', 'GCF_0', 'GCF_1', 'GCF_2', 'GCF_3', 'GCF_4'],
  )
  assert.deepEqual(previewOrthologs([human], 'GCF_H'), [])
})
