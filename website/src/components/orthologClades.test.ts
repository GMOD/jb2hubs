import assert from 'node:assert'
import { test } from 'node:test'

import {
  CLADE_LADDER,
  DEFAULT_SCOPE,
  ORTHOLOG_SCOPES,
  cladeIndex,
  groupByClade,
  scopeById,
} from './orthologClades.ts'

const PRIMATES = 9443
const MAMMALIA = 40674
const RODENTIA = 9989
const EUTHERIA = 9347
const CHORDATA = 7711
const EUKARYOTA = 2759

const humanLineage = new Set([9606, PRIMATES, MAMMALIA, CHORDATA, EUKARYOTA])
const mouseLineage = new Set([10090, RODENTIA, MAMMALIA, CHORDATA, EUKARYOTA])
// a placental in none of the named orders — an elephant, say
const otherMammal = new Set([9785, EUTHERIA, MAMMALIA, CHORDATA, EUKARYOTA])

// The ladder is walked most-specific first, which is the whole reason Primates
// beats Mammalia for a human rather than both matching and the broader one
// winning by being listed later.
test('a lineage lands in the most specific clade that contains it', () => {
  assert.equal(CLADE_LADDER[cladeIndex(humanLineage)]?.label, 'Primates')
  assert.equal(CLADE_LADDER[cladeIndex(mouseLineage)]?.label, 'Rodents')
  assert.equal(
    CLADE_LADDER[cladeIndex(otherMammal)]?.label,
    'Other placental mammals',
  )
})

// Each broad entry only mops up what its narrower siblings above did not take,
// so a mammal outside Eutheria and Metatheria still has somewhere to go.
test('a lineage falls through to the next broadest entry', () => {
  const bareMammal = new Set([9257, MAMMALIA, CHORDATA, EUKARYOTA])
  assert.equal(CLADE_LADDER[cladeIndex(bareMammal)]?.label, 'Other mammals')
  const bareChordate = new Set([7719, CHORDATA, EUKARYOTA])
  assert.equal(CLADE_LADDER[cladeIndex(bareChordate)]?.label, 'Other chordates')
})

// A taxon the subtree omitted arrives as a lineage of just itself. Sorting it
// past every named clade is what keeps its row in the table instead of dropping
// it — the group is called Unclassified and it renders last.
test('an unplaceable lineage sorts past the whole ladder', () => {
  assert.equal(cladeIndex(new Set([999999])), CLADE_LADDER.length)
  assert.equal(cladeIndex(undefined), CLADE_LADDER.length)
})

interface Row {
  taxonId: number
  name: string
}
const rows: Row[] = [
  { taxonId: 9606, name: 'human' },
  { taxonId: 10090, name: 'mouse' },
  { taxonId: 9785, name: 'elephant' },
  { taxonId: 424242, name: 'mystery' },
]
const lineages = new Map([
  [9606, humanLineage],
  [10090, mouseLineage],
  [9785, otherMammal],
])

test('groupByClade emits ladder-ordered, non-empty groups', () => {
  const groups = groupByClade(rows, r => r.taxonId, lineages)
  assert.deepEqual(
    groups.map(g => [g.label, g.rows.length]),
    [
      ['Primates', 1],
      ['Rodents', 1],
      ['Other placental mammals', 1],
      ['Unclassified', 1],
    ],
  )
})

// The caller has already sorted its rows (model organisms first, then
// alphabetically); grouping must not quietly reshuffle within a group.
test('groupByClade keeps the incoming row order inside a group', () => {
  const many = [
    { taxonId: 9606, name: 'first' },
    { taxonId: 9606, name: 'second' },
    { taxonId: 9606, name: 'third' },
  ]
  const [group] = groupByClade(many, r => r.taxonId, lineages)
  assert.deepEqual(
    group?.rows.map(r => r.name),
    ['first', 'second', 'third'],
  )
})

test('groupByClade over no rows is no groups, not one empty one', () => {
  assert.deepEqual(
    groupByClade([], (r: Row) => r.taxonId, lineages),
    [],
  )
})

test('scopeById falls back to the unfiltered scope', () => {
  assert.equal(scopeById('mammals').taxa[0], MAMMALIA)
  assert.equal(scopeById('not-a-scope'), DEFAULT_SCOPE)
  assert.equal(scopeById(null), DEFAULT_SCOPE)
  assert.deepEqual(DEFAULT_SCOPE.taxa, [])
})

// A duplicate id would silently make one scope unreachable through the select,
// and a duplicate ladder id would make its second label dead code.
test('scope ids and ladder ids are each unique', () => {
  const ids = ORTHOLOG_SCOPES.map(s => s.id)
  assert.equal(new Set(ids).size, ids.length)
  const taxa = CLADE_LADDER.map(c => c.id)
  assert.equal(new Set(taxa).size, taxa.length)
})

// The ladder starts at Primates, so a zebrafish search would otherwise open on
// a list of monkeys with the zebrafish row eighteen groups down.
test("groupByClade leads with the pinned taxon's own clade", () => {
  const groups = groupByClade(rows, r => r.taxonId, lineages, 10090)
  assert.deepEqual(
    groups.map(g => g.label),
    ['Rodents', 'Primates', 'Other placental mammals', 'Unclassified'],
  )
})

// A reference whose own row is absent (its genome is not one we host) must not
// reorder anything, and must not crash looking for a group that isn't there.
test('an unknown pinned taxon leaves the ladder order alone', () => {
  const groups = groupByClade(rows, r => r.taxonId, lineages, 123456)
  assert.deepEqual(groups[0]?.label, 'Primates')
})
