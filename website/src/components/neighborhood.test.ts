import assert from 'node:assert'
import { test } from 'node:test'

import { nearestNeighbours, searchPlace } from './neighborhood.ts'

function report(
  geneId: string,
  start: number,
  over: { type?: string; description?: string; refName?: string } = {},
) {
  return {
    geneId,
    symbol: `G${geneId}`,
    type: over.type ?? 'PROTEIN_CODING',
    description: over.description ?? '',
    placements: [
      {
        assembly: 'GCF_1',
        refName: 'NW_9',
        start: start + 7,
        end: start + 8,
        strand: 1 as const,
      },
      {
        assembly: 'GCF_2',
        refName: over.refName ?? 'NC_1',
        start,
        end: start + 100,
        strand: 1 as const,
      },
    ],
  }
}

const query = { geneId: '1', refName: 'NC_1', start: 1000, end: 1100 }

test('nearestNeighbours keeps protein-coding genes on the query sequence, nearest first', () => {
  const reports = [
    report('1', 1000),
    report('1', 1000),
    report('2', 5000),
    report('3', 1500),
    report('4', 1200, { type: 'ncRNA' }),
    report('5', 1300, { description: 'PTGES3L-AARSD1 readthrough' }),
    report('6', 1250, { refName: 'NC_2' }),
    report('3', 1500),
  ]
  assert.deepEqual(
    nearestNeighbours(reports, query, 10).map(n => [n.geneId, n.start]),
    [
      ['3', 1500],
      ['2', 5000],
    ],
  )
  assert.equal(nearestNeighbours(reports, query, 1).length, 1)
})

test('an unplaced scaffold is searched by accession alone', () => {
  assert.equal(
    searchPlace('Unplaced Scaffold', 'NW_003613643.1'),
    'NW_003613643.1[All+Fields]',
  )
  assert.equal(
    searchPlace('17', 'NC_000017.11'),
    '(17[chromosome]+OR+NC_000017.11[All+Fields])',
  )
})
