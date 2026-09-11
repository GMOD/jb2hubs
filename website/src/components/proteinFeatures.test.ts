import assert from 'node:assert'
import { test } from 'node:test'

import {
  parseInterProRegions,
  parseInterfaceRegions,
  regionContaining,
  residueRuns,
} from './proteinFeatures.ts'

// The shape InterPro's entry/all/protein/uniprot answers with, pared down to
// what the parser reads. Modelled on TP53 (P04637), 2026-09-11.
const entry = (
  accession: string,
  source: string,
  type: string,
  name: string | null,
  integrated: string | null,
  ...ranges: [number, number][]
) => ({
  metadata: {
    accession,
    name: name ?? undefined,
    source_database: source,
    type,
    integrated,
  },
  proteins: [
    {
      entry_protein_locations: ranges.map(([start, end]) => ({
        fragments: [{ start, end }],
      })),
    },
  ],
})

const tp53Page = {
  count: 8,
  results: [
    entry(
      'IPR002117',
      'interpro',
      'family',
      'p53 tumour suppressor family',
      null,
      [3, 369],
    ),
    entry(
      'IPR008967',
      'interpro',
      'homologous_superfamily',
      'p53-like TF DNA-binding sf',
      null,
      [97, 287],
    ),
    entry(
      'IPR011615',
      'interpro',
      'domain',
      'p53, DNA-binding domain',
      null,
      [100, 288],
    ),
    entry(
      'IPR010991',
      'interpro',
      'domain',
      'p53, tetramerisation domain',
      null,
      [319, 357],
    ),
    entry(
      'IPR057064',
      'interpro',
      'conserved_site',
      'p53, central conserved site',
      null,
      [237, 249],
    ),
    entry(
      'PF00870',
      'pfam',
      'domain',
      'P53 DNA-binding domain',
      'IPR011615',
      [100, 288],
    ),
    entry(
      'PF07710',
      'pfam',
      'conserved_site',
      'P53 tetramerisation motif',
      'IPR010991',
      [319, 357],
    ),
    entry(
      'PTHR11447',
      'panther',
      'family',
      'CELLULAR TUMOR ANTIGEN P53',
      'IPR002117',
      [3, 369],
    ),
    entry(
      'cd08367',
      'cdd',
      'domain',
      'P53 DNA-binding domain',
      'IPR011615',
      [109, 288],
    ),
  ],
}

test('parseInterProRegions: InterPro domains and sites, with the Pfam under each', () => {
  const regions = parseInterProRegions([tp53Page])
  assert.deepStrictEqual(
    regions.map(r => [r.kind, r.accession, r.start, r.end, r.pfam]),
    [
      ['domain', 'IPR011615', 100, 288, 'PF00870'],
      ['site', 'IPR057064', 237, 249, undefined],
      ['domain', 'IPR010991', 319, 357, 'PF07710'],
    ],
  )
  assert.strictEqual(regions[0]!.name, 'p53, DNA-binding domain')
})

test('parseInterProRegions: family and superfamily entries are not regions', () => {
  const kinds = parseInterProRegions([tp53Page]).map(r => r.accession)
  assert.ok(!kinds.includes('IPR002117'))
  assert.ok(!kinds.includes('IPR008967'))
  assert.ok(!kinds.includes('PTHR11447'))
})

test('parseInterProRegions: an unintegrated Pfam entry stands on its own; other member DBs do not', () => {
  const regions = parseInterProRegions([
    {
      results: [
        entry('PF12345', 'pfam', 'domain', 'Orphan domain', null, [10, 60]),
        entry('cd00001', 'cdd', 'domain', 'Orphan CDD', null, [10, 60]),
        entry('SM00001', 'smart', 'domain', 'Orphan SMART', null, [10, 60]),
      ],
    },
  ])
  assert.deepStrictEqual(
    regions.map(r => [r.accession, r.pfam]),
    [['PF12345', 'PF12345']],
  )
})

test('parseInterProRegions: one region per fragment, across pages, sorted by start', () => {
  const regions = parseInterProRegions([
    {
      results: [
        entry(
          'IPR000742',
          'interpro',
          'domain',
          'EGF-like domain',
          null,
          [500, 530],
          [200, 230],
        ),
      ],
    },
    {
      results: [
        entry(
          'PF00008',
          'pfam',
          'domain',
          'EGF',
          'IPR000742',
          [200, 230],
          [500, 530],
        ),
        entry('IPR000001', 'interpro', 'repeat', 'Some repeat', null, [50, 80]),
      ],
    },
  ])
  assert.deepStrictEqual(
    regions.map(r => [r.kind, r.start, r.end, r.pfam]),
    [
      ['repeat', 50, 80, undefined],
      ['domain', 200, 230, 'PF00008'],
      ['domain', 500, 530, 'PF00008'],
    ],
  )
})

// The PDBe-KB interface_residues shape, on a p53 stand-in: MDM2 at the TAD,
// DNA over the core, an unnamed partner, and the protein against itself.
const interfaces = {
  P04637: {
    length: 393,
    data: [
      {
        name: 'DNA',
        accession: 'DNA',
        residues: [
          { startIndex: 120, endIndex: 120, allPDBEntries: ['1tup', '1tsr'] },
          {
            startIndex: 241,
            endIndex: 243,
            allPDBEntries: ['1tup', '1tsr', '2ac0'],
          },
          { startIndex: 248, endIndex: 248, allPDBEntries: ['1tup'] },
          { startIndex: 273, endIndex: 280, allPDBEntries: ['1tup', '2ac0'] },
        ],
      },
      {
        name: 'E3 ubiquitin-protein ligase Mdm2',
        accession: 'Q00987',
        residues: [
          { startIndex: 17, endIndex: 20, allPDBEntries: ['1ycr'] },
          { startIndex: 22, endIndex: 23, allPDBEntries: ['1ycr'] },
          { startIndex: 25, endIndex: 26, allPDBEntries: ['1ycr', '4hfz'] },
        ],
      },
      {
        name: 'Other',
        accession: 'Other',
        residues: [{ startIndex: 1, endIndex: 5, allPDBEntries: ['9xyz'] }],
      },
      {
        name: 'Maltose/maltodextrin-binding periplasmic protein',
        accession: 'P0AEX9',
        residues: [{ startIndex: 100, endIndex: 290, allPDBEntries: ['4xr8'] }],
      },
      {
        name: 'Cellular tumor antigen p53',
        accession: 'P04637',
        residues: [{ startIndex: 326, endIndex: 356, allPDBEntries: ['1c26'] }],
      },
    ],
  },
}

test('parseInterfaceRegions: one span per partner, most residues first, PDB entries by coverage', () => {
  const regions = parseInterfaceRegions(interfaces, 'P04637')
  assert.deepStrictEqual(
    regions.map(r => [r.name, r.start, r.end, r.residues!.length, r.pdbIds]),
    [
      ['itself (homo-oligomer)', 326, 356, 31, ['1c26']],
      ['DNA', 120, 280, 13, ['1tup', '1tsr', '2ac0']],
      ['E3 ubiquitin-protein ligase Mdm2', 17, 26, 8, ['1ycr', '4hfz']],
    ],
  )
  assert.deepStrictEqual(regions[2]!.residues, [17, 18, 19, 20, 22, 23, 25, 26])
})

test('parseInterfaceRegions: an unknown accession or a 404 body is no partners', () => {
  assert.deepStrictEqual(parseInterfaceRegions(interfaces, 'P00000'), [])
  assert.deepStrictEqual(parseInterfaceRegions(null, 'P04637'), [])
})

test('residueRuns: merges across small gaps only', () => {
  assert.deepStrictEqual(residueRuns([17, 18, 19, 20, 22, 23, 25, 26, 40]), [
    { start: 17, end: 26 },
    { start: 40, end: 40 },
  ])
  assert.deepStrictEqual(residueRuns([1, 2, 6], 2), [
    { start: 1, end: 2 },
    { start: 6, end: 6 },
  ])
})

test('regionContaining: the narrowest domain holding the residue', () => {
  const regions = parseInterProRegions([tp53Page])
  assert.strictEqual(regionContaining(regions, 248)?.accession, 'IPR011615')
  assert.strictEqual(regionContaining(regions, 340)?.accession, 'IPR010991')
  assert.strictEqual(regionContaining(regions, 10), undefined)
})
