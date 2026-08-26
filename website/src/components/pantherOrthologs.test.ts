import assert from 'node:assert'
import { test } from 'node:test'

import {
  parseGenomes,
  parseMatches,
  parseSequences,
  pickOnePerGenome,
} from './pantherOrthologs.ts'

test('parseGenomes: keeps the code<->taxon pairs, drops incomplete rows', () => {
  const genomes = parseGenomes({
    search: {
      output: {
        genomes: {
          genome: [
            {
              short_name: 'HUMAN',
              taxon_id: 9606,
              name: 'human',
              long_name: 'Homo sapiens',
            },
            { short_name: 'NOPE' },
            { taxon_id: 1234 },
          ],
        },
      },
    },
  })
  assert.deepEqual(genomes, [
    { code: 'HUMAN', taxId: 9606, name: 'human', longName: 'Homo sapiens' },
  ])
})

test('parseGenomes: an unexpected shape is empty, not a throw', () => {
  assert.deepEqual(parseGenomes({}), [])
  assert.deepEqual(parseGenomes(null), [])
})

const row = (
  target: string,
  ortholog: string,
  symbol?: string,
): Record<string, unknown> => ({
  gene: 'YEAST|SGD=S000000364|UniProtKB=P00546',
  target_gene: target,
  target_gene_symbol: symbol,
  ortholog,
})

test('parseMatches: reads the query accession and one hit per target gene', () => {
  const parsed = parseMatches({
    search: {
      mapping: {
        mapped: [
          row('HUMAN|HGNC=1773|UniProtKB=P11802', 'O', 'CDK4'),
          row('MOUSE|MGI=88351|UniProtKB=P30285', 'LDO', 'Cdk4'),
        ],
      },
    },
  })
  assert.equal(parsed.unmapped, false)
  assert.equal(parsed.queryAccession, 'P00546')
  assert.deepEqual(parsed.hits, [
    { code: 'HUMAN', accession: 'P11802', symbol: 'CDK4', type: 'O' },
    { code: 'MOUSE', accession: 'P30285', symbol: 'Cdk4', type: 'LDO' },
  ])
})

// PANTHER returns a bare object rather than a one-element array for a single
// match, which is the shape a rare gene comes back as.
test('parseMatches: a lone match arrives unwrapped', () => {
  const parsed = parseMatches({
    search: {
      mapping: { mapped: row('HUMAN|HGNC=1|UniProtKB=P11802', 'LDO') },
    },
  })
  assert.equal(parsed.hits.length, 1)
  assert.equal(parsed.queryAccession, 'P00546')
})

// An unknown gene and a known gene with no orthologs are different answers: the
// first is a bad symbol, the second is a real gene the panel cannot use.
test('parseMatches: an unmapped id is flagged rather than read as no orthologs', () => {
  const unmapped = parseMatches({
    search: { mapping: { unmapped_ids: { unmapped: 'NOSUCHGENE' } } },
  })
  assert.equal(unmapped.unmapped, true)
  assert.deepEqual(unmapped.hits, [])

  const noHits = parseMatches({ search: { mapping: { mapped: { id: 'X' } } } })
  assert.equal(noHits.unmapped, false)
  assert.deepEqual(noHits.hits, [])
})

test('parseMatches: rows that are neither LDO nor O are not orthologs', () => {
  const parsed = parseMatches({
    search: {
      mapping: { mapped: [row('HUMAN|HGNC=1|UniProtKB=P11802', 'P')] },
    },
  })
  assert.deepEqual(parsed.hits, [])
})

test('pickOnePerGenome: the least-diverged ortholog wins its organism', () => {
  const picked = pickOnePerGenome([
    { code: 'HUMAN', accession: 'A', type: 'O' },
    { code: 'HUMAN', accession: 'B', type: 'LDO' },
    { code: 'HUMAN', accession: 'C', type: 'O' },
  ])
  assert.deepEqual(picked, [{ code: 'HUMAN', accession: 'B', type: 'LDO' }])
})

// A many-to-many family — the Hox genes are the case — has no LDO at all, and
// dropping the organism there is what would empty the panel.
test('pickOnePerGenome: with no LDO, the first ortholog keeps the species in', () => {
  const picked = pickOnePerGenome([
    { code: 'DROME', accession: 'A', type: 'O' },
    { code: 'DROME', accession: 'B', type: 'O' },
  ])
  assert.deepEqual(picked, [{ code: 'DROME', accession: 'A', type: 'O' }])
})

test('parseSequences: accession -> sequence, skipping entries without one', () => {
  const map = parseSequences({
    results: [
      { primaryAccession: 'P00546', sequence: { value: 'MEEP' } },
      { primaryAccession: 'P11802' },
      { sequence: { value: 'ORPHAN' } },
    ],
  })
  assert.equal(map.size, 1)
  assert.equal(map.get('P00546'), 'MEEP')
})
