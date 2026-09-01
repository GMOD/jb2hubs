import assert from 'node:assert'
import { test } from 'node:test'

import {
  buildRows,
  oneAssemblyPerSpecies,
  pickBySymbol,
} from './orthologSet.ts'

import type { OrthologRow } from './orthologSet.ts'

// The bug this exists for: NCBI's symbol lookups match aliases as well as
// symbols and do NOT rank the exact match first. Human `TTN` comes back as
// [7276 TTR (transthyretin), 7273 TTN (titin)] from both the Datasets symbol
// endpoint and an esearch `[Gene Name]`, so taking the first hit resolved titin
// to a 147 aa transthyretin — on this page and on the production /orthologs
// page, which shares this resolver.
test('an exact symbol match beats an alias hit that sorts first', () => {
  assert.strictEqual(
    pickBySymbol('TTN', [
      { gene_id: '7276', symbol: 'TTR' },
      { gene_id: '7273', symbol: 'TTN' },
    ]),
    '7273',
  )
})

test('symbol matching ignores case, so a typed lowercase symbol still wins', () => {
  assert.strictEqual(
    pickBySymbol('ttn', [
      { gene_id: '7276', symbol: 'TTR' },
      { gene_id: '7273', symbol: 'TTN' },
    ]),
    '7273',
  )
})

// Falling back to the first hit is what keeps an alias working: `p53` is nobody's
// symbol, and TP53 is the right answer.
test('with no exact match the first hit stands, so an alias still resolves', () => {
  assert.strictEqual(
    pickBySymbol('p53', [{ gene_id: '7157', symbol: 'TP53' }]),
    '7157',
  )
})

test('no candidates resolves to nothing, so the caller can fall through', () => {
  assert.strictEqual(pickBySymbol('NOTAGENE', []), undefined)
})

// A report carrying a symbol but no gene_id cannot be used even when it matches
// exactly; returning undefined sends the caller to its wider search rather than
// silently handing back a different gene's id.
test('an exact match without a gene_id does not fall through to another gene', () => {
  assert.strictEqual(
    pickBySymbol('TTN', [
      { gene_id: '7276', symbol: 'TTR' },
      { symbol: 'TTN' },
    ]),
    undefined,
  )
})

const row = (
  taxonId: number,
  assembly: string,
  geneId: string,
  start = 100,
): OrthologRow => ({
  taxonId,
  assembly,
  symbol: geneId,
  geneId,
  refName: `${assembly}-chr1`,
  chromosome: '1',
  start,
  end: start + 10,
  strand: 1,
})

// The bug this guards: human is annotated on GRCh38 and T2T-CHM13, and each
// anchor took its first placement on its own, so one row could carry GRCh38
// coordinates for the query and CHM13 coordinates for a neighbor.
test('a species keeps the assembly its query ortholog is placed on', () => {
  const rows = oneAssemblyPerSpecies(
    new Map([
      ['q', [row(9606, 'GRCh38', 'q'), row(9606, 'CHM13', 'q')]],
      ['n', [row(9606, 'CHM13', 'n'), row(9606, 'GRCh38', 'n')]],
    ]),
    'q',
  )
  assert.deepEqual(
    [...rows].map(([anchor, r]) => [anchor, r.map(x => x.assembly)]),
    [
      ['q', ['GRCh38']],
      ['n', ['GRCh38']],
    ],
  )
})

test('a species without the query ortholog keeps its majority assembly', () => {
  const rows = oneAssemblyPerSpecies(
    new Map([
      ['q', [row(9606, 'GRCh38', 'q')]],
      ['n1', [row(10090, 'A', 'n1'), row(10090, 'B', 'n1')]],
      ['n2', [row(10090, 'B', 'n2')]],
      ['n3', [row(10090, 'B', 'n3')]],
    ]),
    'q',
  )
  assert.deepEqual(
    [...rows].map(([anchor, r]) => [anchor, r.map(x => x.assembly)]),
    [
      ['q', ['GRCh38']],
      ['n1', ['B']],
      ['n2', ['B']],
      ['n3', ['B']],
    ],
  )
})

test('a second placement on the chosen assembly (an alt locus) is dropped', () => {
  const rows = oneAssemblyPerSpecies(
    new Map([
      ['q', [row(9606, 'GRCh38', 'q', 100), row(9606, 'GRCh38', 'q', 900)]],
    ]),
    'q',
  )
  assert.deepEqual(
    rows.get('q')?.map(r => r.start),
    [100],
  )
})

test('buildRows emits one row per placement, not just the first', () => {
  const rows = buildRows([
    {
      gene: {
        gene_id: '7157',
        symbol: 'TP53',
        tax_id: '9606',
        annotations: [
          {
            assembly_accession: 'GCF_000001405.40',
            genomic_locations: [
              {
                genomic_accession_version: 'NC_000017.11',
                sequence_name: '17',
                genomic_range: {
                  begin: '7668421',
                  end: '7687490',
                  orientation: 'minus',
                },
              },
            ],
          },
          {
            assembly_accession: 'GCF_009914755.1',
            genomic_locations: [
              {
                genomic_accession_version: 'NC_060941.1',
                sequence_name: '17',
                genomic_range: { begin: '7', end: '9', orientation: 'minus' },
              },
            ],
          },
          { assembly_accession: 'unplaced', genomic_locations: [{}] },
        ],
      },
    },
  ])
  assert.deepEqual(
    rows.map(r => [r.assembly, r.refName, r.start, r.strand]),
    [
      ['GCF_000001405.40', 'NC_000017.11', 7668421, -1],
      ['GCF_009914755.1', 'NC_060941.1', 7, -1],
    ],
  )
})
