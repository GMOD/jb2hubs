import assert from 'node:assert'
import { test } from 'node:test'

import {
  type Domain,
  type ProteinPanel,
  alignedRows,
  buildDomainGff,
  buildInputFasta,
  capRows,
  dedupeLabels,
  parseAllDomains,
  parseFasta,
  parseGenpeptDomains,
  unwrapFasta,
} from './proteinMsa.ts'

// A trimmed GenPept record. Qualifiers are indented 21 columns and feature
// locations start at column 22, matching real efetch `rettype=gp` output.
const F = ' '.repeat(5)
const Q = ' '.repeat(21)
const region = (loc: string, quals: string[]) =>
  `${F}Region${' '.repeat(21 - 5 - 'Region'.length)}${loc}\n${quals
    .map(q => Q + q)
    .join('\n')}`

const genpept = [
  'LOCUS       NP_000537                393 aa',
  'VERSION     NP_000537.3',
  'FEATURES             Location/Qualifiers',
  `${F}source          1..393`,
  `${Q}/organism="Homo sapiens"`,
  region('6..30', ['/region_name="P53_TAD"', '/db_xref="CDD:240379"']),
  // A curated interaction site with no CDD xref — must be dropped.
  region('95..150', ['/region_name="Interaction with CCAR2"', '/note="site"']),
  region('109..288', ['/region_name="P53"', '/db_xref="CDD:238088"']),
  // region_name wrapped across two lines.
  region('319..358', [
    '/region_name="P53 tetramerization',
    'domain"',
    '/db_xref="CDD:197586"',
  ]),
  'ORIGIN',
  '        1 meepqsdpsv',
].join('\n')

test('parseGenpeptDomains keeps CDD regions and drops non-CDD sites', () => {
  const domains = parseGenpeptDomains(genpept)
  assert.deepEqual(domains, [
    { start: 6, end: 30, name: 'P53_TAD' },
    { start: 109, end: 288, name: 'P53' },
    { start: 319, end: 358, name: 'P53 tetramerization domain' },
  ])
})

test('parseGenpeptDomains returns nothing when there is no FEATURES table', () => {
  assert.deepEqual(parseGenpeptDomains('LOCUS x\nORIGIN\n//'), [])
})

// A row's accession is versioned when it came from NCBI's product report
// (NP_000537.3) and bare when it came from PANTHER (P00546), but efetch answers
// with whichever version it holds. Keying only on the record's own VERSION
// dropped every domain on the PANTHER rows, which the cartoon renders as "these
// orthologs share no conserved domains" rather than as a failed lookup.
test('parseAllDomains: a record is findable by its bare accession too', () => {
  const byAcc = parseAllDomains(`${genpept}\n//\n`)
  assert.equal(byAcc.get('NP_000537.3')?.length, 3)
  assert.equal(byAcc.get('NP_000537')?.length, 3)
})

test('parseAllDomains: a versioned key is never displaced by a bare one', () => {
  const other = genpept
    .replace('VERSION     NP_000537.3', 'VERSION     NP_000537')
    .replace('/region_name="P53_TAD"', '/region_name="OTHER"')
  const byAcc = parseAllDomains(`${genpept}\n//\n${other}\n//\n`)
  assert.equal(byAcc.get('NP_000537.3')?.[0]?.name, 'P53_TAD')
  // the bare key was claimed by the first record and stays claimed
  assert.equal(byAcc.get('NP_000537')?.[0]?.name, 'P53_TAD')
})

test('parseAllDomains: a record without a VERSION line is skipped', () => {
  assert.equal(parseAllDomains('LOCUS x\nORIGIN\n//\n').size, 0)
})

test('parseFasta concatenates wrapped lines, keyed by accession token', () => {
  const fa =
    '>NP_1.1 some protein [Homo sapiens]\nMKTA\nYIAK\n>NP_2.2 other\nMKTL'
  const map = parseFasta(fa)
  assert.equal(map.get('NP_1.1'), 'MKTAYIAK')
  assert.equal(map.get('NP_2.2'), 'MKTL')
})

test('unwrapFasta collapses each record to one sequence line, keeping gaps', () => {
  const wrapped = '>a\nMKT-\nAYI\n>b\nMK--\nLYI'
  assert.equal(unwrapFasta(wrapped), '>a\nMKT-AYI\n>b\nMK--LYI')
})

test('dedupeLabels sanitizes and disambiguates collisions', () => {
  assert.deepEqual(
    dedupeLabels(['Homo sapiens', 'Mus musculus', 'Homo sapiens']),
    ['Homo_sapiens', 'Mus_musculus', 'Homo_sapiens_2'],
  )
})

test('buildInputFasta uses row labels as headers and drops missing sequences', () => {
  const rows = [
    { label: 'human', protein: 'NP_1.1' },
    { label: 'mouse', protein: 'NP_2.2' }, // no sequence -> dropped
  ]
  const seqs = new Map([['NP_1.1', 'MKTA']])
  assert.equal(buildInputFasta(rows, seqs), '>human\nMKTA')
})

// A panel's rows arrive ordered model-organism-first, so the row caps take the
// head of that order — with one exception, pinned below.
const panelOf = (taxa: number[], refTaxonId: number): ProteinPanel => ({
  query: { symbol: 'TP53', refTaxonId, source: 'ncbi' },
  rows: taxa.map(taxId => ({
    taxId,
    label: `t${taxId}`,
    scientificName: `sp ${taxId}`,
    protein: `NP_${taxId}.1`,
    sequence: 'MKT',
    length: 3,
    domains: [],
  })),
})

test('capRows leaves a list that is already within the cap alone', () => {
  const rows = [{ taxId: 1 }, { taxId: 2 }]
  assert.equal(capRows(rows, 1, 60), rows)
})

test('capRows takes the head of the order', () => {
  assert.deepEqual(capRows([{ taxId: 1 }, { taxId: 2 }, { taxId: 3 }], 1, 2), [
    { taxId: 1 },
    { taxId: 2 },
  ])
})

// A panel that dropped the gene being compared against is not a comparison, and
// the alignment names its reference row as querySeqName.
test('capRows keeps the reference species from beyond the cap', () => {
  assert.deepEqual(capRows([{ taxId: 1 }, { taxId: 2 }, { taxId: 9 }], 9, 2), [
    { taxId: 9 },
    { taxId: 1 },
  ])
})

test('capRows caps a list with no reference row at all', () => {
  assert.deepEqual(capRows([{ taxId: 1 }, { taxId: 2 }, { taxId: 3 }], 99, 2), [
    { taxId: 1 },
    { taxId: 2 },
  ])
})

// The alignment is deliberately narrower than the cartoon: Clustal Omega on all
// 60 rows misses its own deadline on the longest example panels.
test('alignedRows narrows a broad panel and keeps the reference', () => {
  assert.deepEqual(
    alignedRows(panelOf([10, 20, 30, 40, 9606], 9606), 3).map(r => r.taxId),
    [9606, 10, 20],
  )
})

test('alignedRows is the whole panel when the panel is under the cap', () => {
  assert.equal(alignedRows(panelOf([9606, 10090], 9606), 24).length, 2)
})

test('buildDomainGff emits per-row protein_match features in protein coords', () => {
  const rows = [{ label: 'human', protein: 'NP_1.1' }]
  const domains = new Map<string, Domain[]>([
    ['NP_1.1', [{ start: 6, end: 30, name: 'P53; TAD' }]],
  ])
  const gff = buildDomainGff(rows, domains).split('\n')
  assert.equal(gff[0], '##gff-version 3')
  // The ';' in the domain name is stripped so it can't break gff attributes.
  assert.equal(
    gff[1],
    'human\tNCBI\tprotein_match\t6\t30\t.\t.\t.\tName=P53 TAD;description=P53 TAD',
  )
})
