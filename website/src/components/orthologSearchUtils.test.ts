import assert from 'node:assert'
import { test } from 'node:test'

import { createStore } from './orthologDb.ts'
import {
  accessionToJbrowseUrl,
  buildMultiSyntenyUrl,
  buildOrthologResults,
  matchesQuery,
  orthologsToTsv,
  planMultiSynteny,
  refLabel,
  strandFlips,
} from './orthologSearchUtils.ts'
import { buildPairIndex } from './syntenyPairIndex.ts'

import type { AssemblyIndex } from './orthologDb.ts'
import type {
  NcbiOrthologReport,
  OrthologResult,
} from './orthologSearchUtils.ts'
import type { PairEntry } from './syntenyPairIndex.ts'

const indexData: AssemblyIndex = {
  schema: 'ortholog-index/2',
  accessions: ['GCF_000001405.40', 'GCF_000001635.27'],
  ucscDb: { 'GCF_000001405.40': 'hg38' },
}

test('createStore.find returns the hosted accession and its UCSC db', () => {
  const store = createStore(indexData)
  const assembly = store.find('GCF_000001405.40')
  assert.equal(assembly?.accession, 'GCF_000001405.40')
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
    schema: 'ortholog-index/2',
    accessions: ['GCF_000001635.26', 'GCF_000001635.27'],
    ucscDb: {},
  })
  // NCBI reports .25; we host .26 and .27 — the newest (.27) wins deterministically
  assert.equal(store.find('GCF_000001635.25')?.accession, 'GCF_000001635.27')
})

// The config path is a query value, so it is read back the way jbrowse-web
// reads it rather than by substring: encodeURIComponent has turned its slashes
// into %2F.
function configOf(url: string) {
  return new URL(url).searchParams.get('config')
}

test('accessionToJbrowseUrl shards the accession into the config path', () => {
  const url = accessionToJbrowseUrl('GCF_000001405.40')
  assert.equal(
    configOf(url),
    '/hubs/genark/GCF/000/001/405/GCF_000001405.40/config.json',
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
  assert.equal(configOf(url), '/ucsc/hg38/config.json')
  assert.ok(url.includes('&assembly=hg38'))
  assert.ok(!url.includes('/hubs/genark/'))
  assert.ok(url.includes('&loc=NC_000017.11%3A1-2'))
})

test('accessionToJbrowseUrl opens the NCBI gene track on GenArk hubs only', () => {
  const genark = accessionToJbrowseUrl('GCF_000001405.40')
  assert.ok(genark.includes('&tracks=GCF_000001405.40-ncbiGff'))
  // UCSC configs open a gene track through their own defaultSession
  const ucsc = accessionToJbrowseUrl('GCF_000001405.40', undefined, 'hg38')
  assert.ok(!ucsc.includes('&tracks='))
})

test('buildOrthologResults maps reports and ranks common species first', () => {
  const store = createStore(indexData)
  const reports: NcbiOrthologReport[] = [
    {
      gene: {
        gene_id: '111',
        symbol: 'mouseGene',
        tax_id: '10090',
        taxname: 'Mus musculus',
        common_name: 'house mouse',
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
        tax_id: '9606',
        taxname: 'Homo sapiens',
        common_name: 'human',
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

test('buildOrthologResults reads the strand off NCBI orientation', () => {
  const store = createStore(indexData)
  const report = (orientation?: string): NcbiOrthologReport => ({
    gene: {
      gene_id: '222',
      symbol: 'BRCA1',
      tax_id: '9606',
      taxname: 'Homo sapiens',
      annotations: [
        {
          assembly_accession: 'GCF_000001405.40',
          genomic_locations: [
            {
              genomic_accession_version: 'NC_000017.11',
              sequence_name: '17',
              genomic_range: { begin: '300', end: '400', orientation },
            },
          ],
        },
      ],
    },
  })
  assert.equal(buildOrthologResults([report('minus')], store)[0]?.strand, -1)
  assert.equal(buildOrthologResults([report('plus')], store)[0]?.strand, 1)
  // NCBI always names one, but a row with no orientation is a plus-strand row
  // rather than an unflippable one
  assert.equal(buildOrthologResults([report()], store)[0]?.strand, 1)
})

// The index carries no names, so every displayed name is the report's own.
test('buildOrthologResults names each row from its own report', () => {
  const store = createStore(indexData)
  const [row] = buildOrthologResults(
    [
      {
        gene: {
          gene_id: '222',
          symbol: 'humanGene',
          tax_id: '9606',
          taxname: 'Homo sapiens',
          common_name: 'human',
          annotations: [
            {
              assembly_accession: 'GCF_000001405.40',
              genomic_locations: [
                {
                  genomic_accession_version: 'NC_000017.11',
                  sequence_name: '17',
                  genomic_range: { begin: '1', end: '2' },
                },
              ],
            },
          ],
        },
      },
    ],
    store,
  )
  assert.equal(row?.assembly.scientificName, 'Homo sapiens')
  assert.equal(row?.assembly.commonName, 'human')
  assert.equal(row?.assembly.taxonId, 9606)
  // and the one thing the report cannot say: which config a launch targets
  assert.equal(row?.assembly.ucscDb, 'hg38')
  assert.equal(configOf(row?.jbrowseUrl ?? ''), '/ucsc/hg38/config.json')
})

// NCBI files a common name for ~85% of ortholog reports. The row still renders
// on the scientific name alone rather than being dropped or blanked.
test('buildOrthologResults keeps a row whose report has no common name', () => {
  const store = createStore(indexData)
  const rows = buildOrthologResults(
    [
      {
        gene: {
          gene_id: '777',
          symbol: 'noCommon',
          tax_id: '9606',
          taxname: 'Homo sapiens',
          annotations: [
            {
              assembly_accession: 'GCF_000001405.40',
              genomic_locations: [
                {
                  genomic_accession_version: 'NC_000017.11',
                  sequence_name: '17',
                  genomic_range: { begin: '1', end: '2' },
                },
              ],
            },
          ],
        },
      },
    ],
    store,
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.assembly.commonName, undefined)
  assert.equal(rows[0]?.assembly.scientificName, 'Homo sapiens')
  assert.ok(rows.every(r => matchesQuery(r, 'homo')))
  assert.ok(!orthologsToTsv(rows).includes('undefined'))
})

test('buildOrthologResults skips assemblies not in our collection', () => {
  const store = createStore(indexData)
  const reports: NcbiOrthologReport[] = [
    {
      gene: {
        gene_id: '333',
        symbol: 'frogGene',
        tax_id: '9606',
        taxname: 'Homo sapiens',
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
        tax_id: '9606',
        taxname: 'Homo sapiens',
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
        tax_id: '9606',
        taxname: 'Homo sapiens',
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
  strand: 1 | -1 = 1,
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
    strand,
    jbrowseUrl: 'x',
  }
}

// A catalog whose assembly names are just the accessions, which is the common
// case; the UCSC-db-named ones are covered in syntenyPairIndex.test.ts.
function pairs(entries: Record<string, string>) {
  return buildPairIndex(
    Object.fromEntries(
      Object.entries(entries).map(([key, trackId]) => {
        const [a, b] = key.split(',')
        return [
          key,
          [trackId, a ?? '', b ?? '', `${a}-gene`, `${b}-gene`] as PairEntry,
        ]
      }),
    ),
  )
}

// results arrive pre-sorted by proximity to the reference: REF, A, B, C.
const REF = res('REF', 9606)
const A = res('A', 10090)
const B = res('B', 10116)
const C = res('C', 7955)

test('planMultiSynteny chains a path-shaped catalog top-to-bottom', () => {
  const plan = planMultiSynteny(
    [REF, A, B, C],
    'REF',
    pairs({ 'REF,A': 'tREF_A', 'A,B': 'tA_B', 'B,C': 'tB_C' }),
  )
  assert.deepEqual(
    plan?.rows.map(r => r.assembly.accession),
    ['REF', 'A', 'B', 'C'],
  )
  assert.deepEqual(plan?.tracks, ['tREF_A', 'tA_B', 'tB_C'])
  assert.deepEqual(plan?.geneTracks, ['REF-gene', 'A-gene', 'B-gene', 'C-gene'])
})

test('planMultiSynteny flanks the reference with its two nearest partners for a star catalog', () => {
  // every ortholog links only to REF, so REF lands in the middle flanked by A
  // (nearest) and B (next); C cannot be placed without repeating REF.
  const plan = planMultiSynteny(
    [REF, A, B, C],
    'REF',
    pairs({ 'REF,A': 'tREF_A', 'REF,B': 'tREF_B', 'REF,C': 'tREF_C' }),
  )
  assert.deepEqual(
    plan?.rows.map(r => r.assembly.accession),
    ['B', 'REF', 'A'],
  )
  assert.deepEqual(plan?.tracks, ['tREF_B', 'tREF_A'])
})

test('planMultiSynteny matches a track regardless of pair key order', () => {
  const plan = planMultiSynteny([REF, A], 'REF', pairs({ 'A,REF': 'tA_REF' }))
  assert.deepEqual(plan?.tracks, ['tA_REF'])
})

// buildMultiSyntenyUrl turns tracks[i] into level i, and the plan flattens what
// resolveStackNames returns — so a dropped level would not leave a hole, it would
// slide every later track up onto the wrong pair of genomes. What prevents that
// is bestNeighbor refusing an extension whose link disagrees with the name
// already fixed for the node, which means the chain never contains an adjacency
// the resolver then drops. Loosen that guard and this is what notices.
test('a plan has exactly one track per adjacency, never a dropped level', () => {
  // dm6 under two names: the catalog knows the fly as `dm6` against the beetle
  // and as its accession against mouse, so only one of the two can be a panel.
  const plan = planMultiSynteny(
    [REF, A, B, C],
    'REF',
    buildPairIndex({
      'REF,A': ['tREF_A', 'REF', 'A'],
      'A,B': ['tA_B', 'dm6', 'B'],
      'B,C': ['tB_C', 'B', 'C'],
    }),
  )
  assert.ok(plan)
  assert.equal(plan.tracks.length, plan.rows.length - 1)
  assert.equal(plan.geneTracks.length, plan.rows.length)
})

test('planMultiSynteny returns null when nothing chains to the reference', () => {
  assert.equal(
    planMultiSynteny([REF, A, B], 'REF', pairs({ 'A,B': 'tA_B' })),
    null,
  )
  assert.equal(
    planMultiSynteny([REF, A], 'MISSING', pairs({ 'REF,A': 't' })),
    null,
  )
})

test('buildMultiSyntenyUrl emits one level per adjacency and windows each panel', () => {
  const r0 = res('REF', 9606, 300_000, 300_500)
  const r1 = res('A', 10090, 50_000, 50_500)
  const spec = specOf(
    buildMultiSyntenyUrl(
      {
        rows: [r0, r1],
        names: ['REF', 'A'],
        geneTracks: ['REF-gene', 'A-gene'],
        tracks: ['tREF_A'],
      },
      100_000,
    ),
  )
  assert.equal(spec.type, 'LinearSyntenyView')
  // per-level tracks are 2D: one single-track level for the one adjacency
  assert.deepEqual(spec.tracks, [['tREF_A']])
  // each panel opens its own gene track, or it lands on the right locus with
  // nothing drawn
  assert.deepEqual(spec.views, [
    { assembly: 'REF', loc: 'NC_1:200000-400500', tracks: ['REF-gene'] },
    // begin - flank clamps at 1 rather than going negative
    { assembly: 'A', loc: 'NC_1:1-150500', tracks: ['A-gene'] },
  ])
})

// The defect this fixes: BRCA1 is minus on hg38 chr17 and plus on the chimp and
// gorilla chromosomes it aligns to, so the human row drew its neighborhood
// back-to-front and both ribbons crossed the strip diagonally.
test('buildMultiSyntenyUrl flips a row whose ortholog runs the other way', () => {
  const chimp = res('GCF_CHIMP', 9598, 25_025_791, 25_106_592, 'NC_072417.2')
  const human = res('hg38', 9606, 43_044_295, 43_170_327, 'NC_000017.11', -1)
  const gorilla = res('GCF_GOR', 9595, 49_344_066, 49_425_506, 'NC_073228.2')
  const spec = specOf(
    buildMultiSyntenyUrl(
      {
        rows: [chimp, human, gorilla],
        names: ['GCF_CHIMP', 'hg38', 'GCF_GOR'],
        geneTracks: ['c-gene', 'h-gene', 'g-gene'],
        tracks: ['tC_H', 'tH_G'],
      },
      100_000,
    ),
  )
  assert.deepEqual(
    spec.views.map((v: { loc: string }) => v.loc),
    [
      'NC_072417.2:24925791-25206592',
      'NC_000017.11:42944295-43270327[rev]',
      'NC_073228.2:49244066-49525506',
    ],
  )
})

// Anchoring on the top row rather than on the reference, which the chain usually
// leaves in the middle: matching the reference here would flip the two rows
// around it instead of the one that disagrees.
test('strandFlips matches every row to the top one, not to the reference', () => {
  assert.deepEqual(
    strandFlips([res('A', 1, 1, 2, 'NC_1', -1), res('B', 2), res('C', 3)]),
    [false, true, true],
  )
  assert.deepEqual(
    strandFlips([res('A', 1), res('B', 2, 1, 2, 'NC_1', -1), res('C', 3)]),
    [false, true, false],
  )
})

test('a stack that agrees on strand is launched unflipped', () => {
  assert.deepEqual(strandFlips([res('A', 1), res('B', 2)]), [false, false])
  assert.deepEqual(
    strandFlips([res('A', 1, 1, 2, 'NC_1', -1), res('B', 2, 1, 2, 'NC_1', -1)]),
    [false, false],
  )
})

test('refLabel names known model organisms and passes anything else through', () => {
  assert.equal(refLabel('9606'), 'Human')
  // free-text references (any species NCBI taxonomy knows) round-trip unchanged
  assert.equal(refLabel('8296'), '8296')
  assert.equal(refLabel('axolotl'), 'axolotl')
})

// A reader at a table of several hundred species types a species or a symbol;
// ANDing the terms is what makes a second word narrow rather than widen.
test('matchesQuery ANDs terms across species, symbol and accession', () => {
  const row = res('GCF_000001635.27', 10090)
  row.assembly.scientificName = 'Mus musculus'
  row.assembly.commonName = 'house mouse'
  row.geneSymbol = 'Brca1'

  assert.equal(matchesQuery(row, ''), true)
  assert.equal(matchesQuery(row, '   '), true)
  assert.equal(matchesQuery(row, 'MUS'), true)
  assert.equal(matchesQuery(row, 'brca'), true)
  assert.equal(matchesQuery(row, 'GCF_000001635'), true)
  assert.equal(matchesQuery(row, 'mus brca'), true)
  assert.equal(matchesQuery(row, 'mus rattus'), false)
})

// The scope rides in the url so a shared link reproduces the same answer, but
// the default is left off — the other gene-first pages read ?gene=&ref= and a
// third param on every link would be noise.
// Tab-separated, because the common names carry commas and nothing here can
// carry a tab — so the export needs no quoting rules to stay parseable.
test('orthologsToTsv emits a header plus one line per row', () => {
  const row = res('GCF_000001635.27', 10090, 100, 200, 'NC_000077.7')
  row.assembly.scientificName = 'Mus musculus'
  row.assembly.commonName = 'house mouse (GRCm39, 2020)'
  row.geneSymbol = 'Brca1'
  const lines = orthologsToTsv([row]).split('\n')
  assert.equal(lines.length, 2)
  assert.equal(lines[0]?.split('\t')[0], 'scientific_name')
  assert.deepEqual(lines[1]?.split('\t').slice(0, 9), [
    'Mus musculus',
    'house mouse (GRCm39, 2020)',
    '10090',
    'Brca1',
    '1',
    'GCF_000001635.27',
    'NC_000077.7',
    'c',
    '100',
  ])
})

test('orthologsToTsv over no rows is the header alone', () => {
  assert.equal(orthologsToTsv([]).split('\n').length, 1)
})
