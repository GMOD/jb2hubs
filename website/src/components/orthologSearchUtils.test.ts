import assert from 'node:assert'
import { test } from 'node:test'

import { createStore } from './orthologDb.ts'
import {
  accessionToJbrowseUrl,
  buildMultiSyntenyUrl,
  buildOrthologResults,
  planMultiSynteny,
} from './orthologSearchUtils.ts'

import type {
  AssemblyIndex,
  NcbiOrthologReport,
  OrthologResult,
} from './orthologSearchUtils.ts'

const indexData: AssemblyIndex = {
  'GCF_000001405.40': ['Human', 'Homo sapiens', 9606, 'hg38'],
  'GCF_000001635.27': ['Mouse', 'Mus musculus', 10090],
}

test('createStore.find returns named assembly fields', () => {
  const store = createStore(indexData)
  const assembly = store.find('GCF_000001405.40')
  assert.equal(assembly?.accession, 'GCF_000001405.40')
  assert.equal(assembly?.commonName, 'Human')
  assert.equal(assembly?.scientificName, 'Homo sapiens')
  assert.equal(assembly?.taxonId, 9606)
  assert.equal(assembly?.ucscDb, 'hg38')
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

test('createStore.find resolves the base fallback to the newest hosted version', () => {
  const store = createStore({
    'GCF_000001635.26': ['Mouse', 'Mus musculus', 10090],
    'GCF_000001635.27': ['Mouse', 'Mus musculus', 10090],
  })
  // NCBI reports .25; we host .26 and .27 — the newest (.27) wins deterministically
  assert.equal(store.find('GCF_000001635.25')?.accession, 'GCF_000001635.27')
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

test('accessionToJbrowseUrl targets the /ucsc config for UCSC-native assemblies', () => {
  const url = accessionToJbrowseUrl(
    'GCF_000001405.40',
    'NC_000017.11:1-2',
    'hg38',
  )
  assert.ok(url.includes('config=/ucsc/hg38/config.json'))
  assert.ok(url.includes('&assembly=hg38'))
  assert.ok(!url.includes('/hubs/genark/'))
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

test('buildOrthologResults resolves off a later location when the first lacks a range', () => {
  const store = createStore(indexData)
  const reports: NcbiOrthologReport[] = [
    {
      gene: {
        gene_id: '555',
        symbol: 'lateLoc',
        annotations: [
          {
            assembly_accession: 'GCF_000001405.40',
            genomic_locations: [
              {
                genomic_accession_version: 'NW_unplaced.1',
                sequence_name: 'un',
              },
              {
                genomic_accession_version: 'NC_000017.11',
                sequence_name: '17',
                genomic_range: { begin: '10', end: '20' },
              },
            ],
          },
        ],
      },
    },
  ]
  const results = buildOrthologResults(reports, store)
  assert.equal(results.length, 1)
  assert.equal(results[0]?.locStr, 'NC_000017.11:10-20')
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

// Pull the decoded LinearSyntenyView spec back out of a launch URL.
function specOf(url: string) {
  const spec = new URL(url).searchParams.get('session')!
  return JSON.parse(spec.replace(/^spec-/, '')).views[0]
}

function res(
  accession: string,
  taxonId: number,
  begin = 100,
  end = 200,
  refName = 'NC_1',
): OrthologResult {
  return {
    assembly: {
      accession,
      commonName: accession,
      scientificName: accession,
      taxonId,
    },
    geneSymbol: 'G',
    geneId: '1',
    chromosome: 'c',
    begin,
    end,
    locStr: `${refName}:${begin}-${end}`,
    jbrowseUrl: 'x',
  }
}

// results arrive pre-sorted by proximity to the reference: REF, A, B, C.
const REF = res('REF', 9606)
const A = res('A', 10090)
const B = res('B', 10116)
const C = res('C', 7955)

test('planMultiSynteny chains a path-shaped catalog top-to-bottom', () => {
  const plan = planMultiSynteny([REF, A, B, C], 'REF', {
    'REF,A': 'tREF_A',
    'A,B': 'tA_B',
    'B,C': 'tB_C',
  })
  assert.deepEqual(
    plan?.rows.map(r => r.assembly.accession),
    ['REF', 'A', 'B', 'C'],
  )
  assert.deepEqual(plan?.tracks, ['tREF_A', 'tA_B', 'tB_C'])
})

test('planMultiSynteny flanks the reference with its two nearest partners for a star catalog', () => {
  // every ortholog links only to REF, so REF lands in the middle flanked by A
  // (nearest) and B (next); C cannot be placed without repeating REF.
  const plan = planMultiSynteny([REF, A, B, C], 'REF', {
    'REF,A': 'tREF_A',
    'REF,B': 'tREF_B',
    'REF,C': 'tREF_C',
  })
  assert.deepEqual(
    plan?.rows.map(r => r.assembly.accession),
    ['B', 'REF', 'A'],
  )
  assert.deepEqual(plan?.tracks, ['tREF_B', 'tREF_A'])
})

test('planMultiSynteny matches a track regardless of pair key order', () => {
  const plan = planMultiSynteny([REF, A], 'REF', { 'A,REF': 'tA_REF' })
  assert.deepEqual(plan?.tracks, ['tA_REF'])
})

test('planMultiSynteny returns null when nothing chains to the reference', () => {
  assert.equal(planMultiSynteny([REF, A, B], 'REF', { 'A,B': 'tA_B' }), null)
  assert.equal(planMultiSynteny([REF, A], 'MISSING', { 'REF,A': 't' }), null)
})

test('buildMultiSyntenyUrl emits one level per adjacency and windows each panel', () => {
  const r0 = res('REF', 9606, 300_000, 300_500)
  const r1 = res('A', 10090, 50_000, 50_500)
  const spec = specOf(
    buildMultiSyntenyUrl({ rows: [r0, r1], tracks: ['tREF_A'] }, 100_000),
  )
  assert.equal(spec.type, 'LinearSyntenyView')
  // per-level tracks are 2D: one single-track level for the one adjacency
  assert.deepEqual(spec.tracks, [['tREF_A']])
  assert.deepEqual(spec.views, [
    { assembly: 'REF', loc: 'NC_1:200000-400500' },
    // begin - flank clamps at 1 rather than going negative
    { assembly: 'A', loc: 'NC_1:1-150500' },
  ])
})
