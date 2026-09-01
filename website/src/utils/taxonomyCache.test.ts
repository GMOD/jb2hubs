import assert from 'node:assert'
import { test } from 'node:test'

import {
  budgetTree,
  buildTaxonomyIndex,
  collectAccessions,
  parseTaxonomyNewick,
  taxonIdsIn,
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

// This drives getStaticPaths for the ~74K taxonomy pages, so missing a form here
// means those pages are simply never built.
test('taxonIdsIn collects both node forms, deduped', () => {
  assert.deepEqual([...taxonIdsIn(NEWICK)].sort(), [
    '10090',
    '40674',
    '9598',
    '9604',
    '9606',
  ])
})

test('taxonIdsIn ignores an accession-only leaf, which names no taxon', () => {
  assert.deepEqual([...taxonIdsIn('(Foo[GCA_000000001.1])Bar{7};')], ['7'])
})

test('taxonIdsIn does not let a bracket swallow the one after it', () => {
  // A greedy [^|]+ would run "a]x[b" together and read one pair off the tail.
  assert.deepEqual([...taxonIdsIn('(A[GCA_1|11],B[GCA_2|22])C{33};')].sort(), [
    '11',
    '22',
    '33',
  ])
})

// root -> {a: [a1, a2, a3], b: [b1]} -> a1: [x, y]; 9 nodes, 5 accessions
const BUSHY =
  '(((x[GCA_x|1]:1,y[GCA_y|2]:1)a1{11}:1,a2[GCA_a2|12]:1,a3[GCA_a3|13]:1)a{10}:1,(b1[GCA_b1|21]:1)b{20}:1)root{1};'

function names(node: TaxonomyNode): unknown {
  return node.children
    ? { [node.name!]: node.children.map(names) }
    : node.hiddenAccessions === undefined
      ? node.name
      : `${node.name}+${node.hiddenAccessions}`
}

test('budgetTree takes whole levels while they fit and cuts below the last one', () => {
  const root = parseTaxonomyNewick(BUSHY)!
  // 1 + 2 + 4 = 7 fits; the next level would be 9
  assert.deepEqual(names(budgetTree(root, 8)), {
    root: [{ a: ['a1+2', 'a2', 'a3'] }, { b: ['b1'] }],
  })
  // b1 is a leaf under b, so b is rendered whole even though a1 is cut
  assert.deepEqual(names(budgetTree(root, 3)), {
    root: ['a+4', 'b+1'],
  })
})

test("budgetTree always renders the root's own children, even over budget", () => {
  const root = parseTaxonomyNewick(BUSHY)!
  assert.deepEqual(names(budgetTree(root, 1)), { root: ['a+4', 'b+1'] })
})

test('budgetTree returns the whole tree when it fits, and leaves the input alone', () => {
  const root = parseTaxonomyNewick(BUSHY)!
  const before = JSON.stringify(root)
  const whole = budgetTree(root, 10)
  assert.deepEqual(names(whole), {
    root: [{ a: [{ a1: ['x', 'y'] }, 'a2', 'a3'] }, { b: ['b1'] }],
  })
  assert.equal(collectAccessions(whole).length, 5)
  budgetTree(root, 2)
  assert.equal(JSON.stringify(root), before)
})

test('budgetTree keeps depth and taxonId on what it renders', () => {
  const root = parseTaxonomyNewick(BUSHY)!
  const cut = budgetTree(root, 3)
  assert.equal(cut.children![0]!.taxonId, '10')
  assert.equal(cut.children![0]!.depth, 1)
  assert.equal(cut.children![0]!.children, undefined)
})
