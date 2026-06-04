/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert'
import { test } from 'node:test'

import { createStore } from './orthologDb.ts'
import {
  accessionToJbrowseUrl,
  buildOrthologResults,
} from './orthologSearchUtils.ts'

import type {
  AssemblyIndex,
  NcbiOrthologReport,
} from './orthologSearchUtils.ts'

const indexData: AssemblyIndex = {
  'GCF_000001405.40': ['Human', 'Homo sapiens', 9606],
  'GCF_000001635.27': ['Mouse', 'Mus musculus', 10090],
}

test('createStore.find returns named assembly fields', () => {
  const store = createStore(indexData)
  const assembly = store.find('GCF_000001405.40')
  assert.equal(assembly?.accession, 'GCF_000001405.40')
  assert.equal(assembly?.commonName, 'Human')
  assert.equal(assembly?.scientificName, 'Homo sapiens')
  assert.equal(assembly?.taxonId, 9606)
})

test('createStore.find falls back to a version-stripped match', () => {
  const store = createStore(indexData)
  // NCBI reports .39 but we host .40
  const assembly = store.find('GCF_000001405.39')
  assert.equal(assembly?.accession, 'GCF_000001405.40')
})

test('createStore.find returns undefined for an unknown accession', () => {
  const store = createStore(indexData)
  assert.equal(store.find('GCF_999999999.1'), undefined)
})

test('accessionToJbrowseUrl shards the accession into the config path', () => {
  const url = accessionToJbrowseUrl('GCF_000001405.40')
  assert.ok(
    url.includes('/hubs/genark/GCF/000/001/405/GCF_000001405.40/config.json'),
  )
  assert.ok(!url.includes('&loc='))
})

test('accessionToJbrowseUrl appends an encoded loc when given', () => {
  const url = accessionToJbrowseUrl('GCF_000001405.40', 'NC_000017.11:1-2')
  assert.ok(url.includes('&loc=NC_000017.11%3A1-2'))
})

test('buildOrthologResults maps reports and ranks common species first', () => {
  const store = createStore(indexData)
  const reports: NcbiOrthologReport[] = [
    {
      gene: {
        gene_id: '111',
        symbol: 'mouseGene',
        annotations: [
          {
            assembly_accession: 'GCF_000001635.27',
            genomic_locations: [
              {
                genomic_accession_version: 'NC_000077.7',
                sequence_name: '11',
                genomic_range: { begin: '100', end: '200' },
              },
            ],
          },
        ],
      },
    },
    {
      gene: {
        gene_id: '222',
        symbol: 'humanGene',
        annotations: [
          {
            assembly_accession: 'GCF_000001405.40',
            genomic_locations: [
              {
                genomic_accession_version: 'NC_000017.11',
                sequence_name: '17',
                genomic_range: { begin: '300', end: '400' },
              },
            ],
          },
        ],
      },
    },
  ]

  const results = buildOrthologResults(reports, store)
  assert.equal(results.length, 2)
  // Human (taxId 9606, rank 0) sorts before Mouse (taxId 10090, rank 1)
  assert.equal(results[0]?.assembly.scientificName, 'Homo sapiens')
  assert.equal(results[0]?.geneSymbol, 'humanGene')
  assert.equal(results[0]?.chromosome, '17')
  assert.equal(results[0]?.locStr, 'NC_000017.11:300-400')
  assert.equal(results[1]?.assembly.scientificName, 'Mus musculus')
})

test('buildOrthologResults skips assemblies not in our collection', () => {
  const store = createStore(indexData)
  const reports: NcbiOrthologReport[] = [
    {
      gene: {
        gene_id: '333',
        symbol: 'frogGene',
        annotations: [
          {
            assembly_accession: 'GCF_000004195.4',
            genomic_locations: [
              {
                genomic_accession_version: 'NC_030677.2',
                sequence_name: '1',
                genomic_range: { begin: '1', end: '2' },
              },
            ],
          },
        ],
      },
    },
  ]
  assert.equal(buildOrthologResults(reports, store).length, 0)
})

test('buildOrthologResults skips annotations lacking a genomic range', () => {
  const store = createStore(indexData)
  const reports: NcbiOrthologReport[] = [
    {
      gene: {
        gene_id: '444',
        symbol: 'noRange',
        annotations: [
          {
            assembly_accession: 'GCF_000001405.40',
            genomic_locations: [
              {
                genomic_accession_version: 'NC_000017.11',
                sequence_name: '17',
              },
            ],
          },
        ],
      },
    },
  ]
  assert.equal(buildOrthologResults(reports, store).length, 0)
})
