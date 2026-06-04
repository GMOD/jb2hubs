import assert from 'node:assert'
import { test } from 'node:test'

import {
  accessionBase,
  accessionToJbrowseUrl,
  buildBaseIndex,
  buildOrthologResults,
  resolveHit,
} from './orthologSearchUtils.ts'
import type {
  NcbiOrthologReport,
  OrthologIndex,
} from './orthologSearchUtils.ts'

const index: OrthologIndex = {
  'GCF_000001405.40': ['Human', 'Homo sapiens', 9606],
  'GCF_000001635.27': ['Mouse', 'Mus musculus', 10090],
}

test('accessionBase strips the version suffix', () => {
  assert.equal(accessionBase('GCF_000001405.40'), 'GCF_000001405')
  assert.equal(accessionBase('GCF_000001405'), 'GCF_000001405')
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

test('resolveHit prefers an exact accession match', () => {
  const baseIndex = buildBaseIndex(index)
  const hit = resolveHit(index, baseIndex, 'GCF_000001405.40')
  assert.equal(hit?.accession, 'GCF_000001405.40')
  assert.equal(hit?.entry[0], 'Human')
})

test('resolveHit falls back to a version-stripped match', () => {
  const baseIndex = buildBaseIndex(index)
  // NCBI reports .39 but we host .40
  const hit = resolveHit(index, baseIndex, 'GCF_000001405.39')
  assert.equal(hit?.accession, 'GCF_000001405.40')
})

test('resolveHit returns undefined for an unknown accession', () => {
  const baseIndex = buildBaseIndex(index)
  assert.equal(resolveHit(index, baseIndex, 'GCF_999999999.1'), undefined)
})

test('buildOrthologResults maps reports and ranks common species first', () => {
  const reports: NcbiOrthologReport[] = [
    {
      gene: {
        gene_id: '111',
        symbol: 'mouseGene',
        annotations: [
          {
            assembly_accession: 'GCF_000001635.27',
            assembly_name: 'GRCm39',
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
            assembly_name: 'GRCh38',
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

  const results = buildOrthologResults(reports, index)
  assert.equal(results.length, 2)
  // Human (taxId 9606, rank 0) sorts before Mouse (taxId 10090, rank 1)
  assert.equal(results[0]?.scientificName, 'Homo sapiens')
  assert.equal(results[0]?.geneSymbol, 'humanGene')
  assert.equal(results[0]?.chromosome, '17')
  assert.equal(results[0]?.locStr, 'NC_000017.11:300-400')
  assert.equal(results[1]?.scientificName, 'Mus musculus')
})

test('buildOrthologResults skips assemblies not in our collection', () => {
  const reports: NcbiOrthologReport[] = [
    {
      gene: {
        gene_id: '333',
        symbol: 'frogGene',
        annotations: [
          {
            assembly_accession: 'GCF_000004195.4',
            assembly_name: 'UCB_Xtro_10.0',
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
  const results = buildOrthologResults(reports, index)
  assert.equal(results.length, 0)
})

test('buildOrthologResults skips annotations lacking a genomic range', () => {
  const reports: NcbiOrthologReport[] = [
    {
      gene: {
        gene_id: '444',
        symbol: 'noRange',
        annotations: [
          {
            assembly_accession: 'GCF_000001405.40',
            assembly_name: 'GRCh38',
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
  const results = buildOrthologResults(reports, index)
  assert.equal(results.length, 0)
})
