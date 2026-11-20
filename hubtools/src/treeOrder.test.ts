import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { groupRanker, tracksInTreeOrder } from './treeOrder.ts'

const track = (name: string, ...category: string[]) => ({
  trackId: name,
  name,
  ...(category.length > 0 ? { category } : {}),
})

const names = (tracks: { name: string }[]) => tracks.map(t => t.name)

describe('tracksInTreeOrder', () => {
  it('lists genes first, then UCSC order, a hub group after those, liftOver last', () => {
    assert.deepEqual(
      names(
        tracksInTreeOrder([
          track('hg19 to Panda', 'Pairwise alignments', 'liftOver'),
          track('phyloP', 'Comparative Genomics'),
          track('escape', 'immu'),
          track('GC Percent', 'Mapping and Sequencing'),
          track('RefSeq', 'Genes and Gene Predictions'),
          track('dbSNP', 'Variation and Repeats'),
        ]),
      ),
      ['RefSeq', 'GC Percent', 'dbSNP', 'phyloP', 'escape', 'hg19 to Panda'],
    )
  })

  it('follows the assembly own grp table where it has one', () => {
    const mm39 = groupRanker([
      ['map', 2],
      ['genes', 3],
      ['compGeno', 6],
      ['varRep', 7],
    ])
    assert.deepEqual(
      names(
        tracksInTreeOrder(
          [
            track('EVA SNP', 'Variation and Repeats'),
            track('phyloP', 'Comparative Genomics'),
            track('RefSeq', 'Genes and Gene Predictions'),
          ],
          mm39,
        ),
      ),
      ['RefSeq', 'phyloP', 'EVA SNP'],
    )
  })

  it('leaves uncategorized tracks first, as they came', () => {
    assert.deepEqual(
      names(
        tracksInTreeOrder([
          track('RefSeq', 'Genes and Gene Predictions'),
          track('Reference sequence'),
          track('Assembly'),
        ]),
      ),
      ['Reference sequence', 'Assembly', 'RefSeq'],
    )
  })

  it('sorts a group by name, numbers by value, its own tracks ahead of its subcategories', () => {
    assert.deepEqual(
      names(
        tracksInTreeOrder([
          track('sample10', 'Regulation'),
          track('Zebra', 'Regulation', 'ENCODE'),
          track('sample2', 'Regulation'),
          track('alpha', 'Regulation'),
        ]),
      ),
      ['alpha', 'sample2', 'sample10', 'Zebra'],
    )
  })
})
