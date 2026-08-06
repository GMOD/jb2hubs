import assert from 'node:assert'
import { test } from 'node:test'

import {
  buildTaxonomyIndex,
  collectAccessions,
  parseTaxonomyNewick,
} from './taxonomyCache.ts'

import type { TaxonomyNode } from './taxonomyCache.ts'

// The shape taxonomyBuilder emits: internal nodes carry Name{taxonId}, leaves
// carry Name[accession|taxonId], and every edge has a branch length.
const NEWICK =
  '((Homo sapiens[GCF_000001405.40|9606]:1.0,Pan troglodytes[GCF_028858775.2|9598]:1.0)Hominidae{9604}:1.0,Mus musculus[GCF_000001635.27|10090]:1.0)Mammalia{40674};'

function tree() {
  const t = parseTaxonomyNewick(NEWICK)
  assert.ok(t, 'parsed')
  return t
}

test('internal nodes take Name{taxonId} and leaves Name[accession|taxonId]', () => {
  const root = tree()
  assert.equal(root.name, 'Mammalia')
  assert.equal(root.taxonId, '40674')
  assert.equal(root.accession, undefined)

  const hominidae = root.children![0]!
  assert.equal(hominidae.name, 'Hominidae')
  assert.equal(hominidae.taxonId, '9604')

  const human = hominidae.children![0]!
  assert.equal(human.name, 'Homo sapiens')
  assert.equal(human.accession, 'GCF_000001405.40')
  assert.equal(human.taxonId, '9606')
  assert.equal(human.branchLength, 1)
})

test('a bracket without a pipe is an accession with no taxon', () => {
  const root = parseTaxonomyNewick('(Foo[GCA_000000001.1])Bar{7};')!
  const leaf = root.children![0]!
  assert.equal(leaf.accession, 'GCA_000000001.1')
  assert.equal(leaf.taxonId, undefined)
})

test('depth counts edges from the root, which is what the zebra striping reads', () => {
  const root = tree()
  assert.equal(root.depth, 0)
  assert.equal(root.children![0]!.depth, 1)
  assert.equal(root.children![0]!.children![0]!.depth, 2)
})

test('leaves have no children key at all, so the renderer can branch on it', () => {
  assert.equal(tree().children![1]!.children, undefined)
})

// The generated trees wrap a single species in a group of the same name. Drawn
// literally that is a collapsible "Danio rerio" containing one row, also
// "Danio rerio" — so the pass folds the pair into the leaf.
test('a lone same-named leaf child is folded into its parent', () => {
  const root = parseTaxonomyNewick(
    '((Danio rerio[GCF_000002035.6|7955]:0.5)Danio rerio{7955})Cyprinidae{7953};',
  )!
  const folded = root.children![0]!
  assert.equal(folded.name, 'Danio rerio')
  assert.equal(folded.accession, 'GCF_000002035.6')
  assert.equal(folded.children, undefined)
  // The leaf's own branch length survives the fold; the wrapper's is discarded.
  assert.equal(folded.branchLength, 0.5)
})

test('a differently-named single child is NOT folded', () => {
  const root = parseTaxonomyNewick(
    '((Danio rerio[GCF_000002035.6|7955])Danio{7954})Cyprinidae{7953};',
  )!
  assert.equal(root.children![0]!.name, 'Danio')
  assert.equal(root.children![0]!.children!.length, 1)
})

test('empty or semicolon-only input is null, not a throw', () => {
  assert.equal(parseTaxonomyNewick(''), null)
  assert.equal(parseTaxonomyNewick('   \n'), null)
  assert.equal(parseTaxonomyNewick(';'), null)
})

test('collectAccessions walks the whole subtree, and tolerates null', () => {
  assert.deepEqual(collectAccessions(tree()), [
    'GCF_000001405.40',
    'GCF_028858775.2',
    'GCF_000001635.27',
  ])
  assert.deepEqual(collectAccessions(null), [])
})

test('subtree finds a taxon at any level; an unknown one is null', () => {
  const index = buildTaxonomyIndex(tree())
  assert.equal(index.subtree('9604')?.name, 'Hominidae')
  assert.equal(index.subtree('9606')?.accession, 'GCF_000001405.40')
  assert.equal(index.subtree('404404'), null)
})

test('lineage runs root-first and includes the taxon itself', () => {
  const index = buildTaxonomyIndex(tree())
  assert.deepEqual(
    index.lineage('9606').map(n => n.name),
    ['Mammalia', 'Hominidae', 'Homo sapiens'],
  )
  assert.deepEqual(
    index.lineage('40674').map(n => n.name),
    ['Mammalia'],
  )
  assert.deepEqual(index.lineage('404404'), [])
})

// The index is what 74K pages are built from, so a taxon appearing twice has to
// resolve the same way every time rather than depending on visit order.
test('a repeated taxonId resolves to its first node in pre-order', () => {
  const root: TaxonomyNode = {
    name: 'root',
    depth: 0,
    children: [
      { name: 'first', taxonId: '42', depth: 1 },
      { name: 'second', taxonId: '42', depth: 1 },
    ],
  }
  assert.equal(buildTaxonomyIndex(root).subtree('42')?.name, 'first')
})
