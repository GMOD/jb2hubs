import assert from 'node:assert'
import { test } from 'node:test'

import {
  type Domain,
  buildDomainGff,
  buildInputFasta,
  dedupeLabels,
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

test('parseFasta concatenates wrapped lines, keyed by accession token', () => {
  const fa = '>NP_1.1 some protein [Homo sapiens]\nMKTA\nYIAK\n>NP_2.2 other\nMKTL'
  const map = parseFasta(fa)
  assert.equal(map.get('NP_1.1'), 'MKTAYIAK')
  assert.equal(map.get('NP_2.2'), 'MKTL')
})

test('unwrapFasta collapses each record to one sequence line, keeping gaps', () => {
  const wrapped = '>a\nMKT-\nAYI\n>b\nMK--\nLYI'
  assert.equal(unwrapFasta(wrapped), '>a\nMKT-AYI\n>b\nMK--LYI')
})

test('dedupeLabels sanitizes and disambiguates collisions', () => {
  assert.deepEqual(dedupeLabels(['Homo sapiens', 'Mus musculus', 'Homo sapiens']), [
    'Homo_sapiens',
    'Mus_musculus',
    'Homo_sapiens_2',
  ])
})

test('buildInputFasta uses row labels as headers and drops missing sequences', () => {
  const rows = [
    { label: 'human', protein: 'NP_1.1' },
    { label: 'mouse', protein: 'NP_2.2' }, // no sequence -> dropped
  ]
  const seqs = new Map([['NP_1.1', 'MKTA']])
  assert.equal(buildInputFasta(rows, seqs), '>human\nMKTA')
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
