import assert from 'node:assert'
import { test } from 'node:test'

import {
  planFromSelection,
  sharedAncestors,
  suggestedSelection,
  syntenyCandidates,
} from './multiSyntenyPicker.ts'
import { buildPairIndex } from './syntenyPairIndex.ts'

import type { OrthologResult } from './orthologSearchUtils.ts'
import type { PairEntry } from './syntenyPairIndex.ts'

function res(
  accession: string,
  taxonId: number,
  scientificName: string,
): OrthologResult {
  return {
    assembly: { accession, scientificName, taxonId },
    geneSymbol: 'TP53',
    geneId: '1',
    chromosome: '1',
    begin: 100,
    end: 200,
    locStr: 'NC_1:100-200',
    jbrowseUrl: 'x',
  }
}

function pairs(entries: Record<string, string>) {
  return buildPairIndex(
    Object.fromEntries(
      Object.entries(entries).map(([key, trackId]) => {
        const [a, b] = key.split(',')
        return [
          key,
          [trackId, a ?? '', b ?? '', `${a}-gene`, `${b}-gene`] as PairEntry,
        ]
      }),
    ),
  )
}

const HUMAN = res('GCF_H', 9606, 'Homo sapiens')
const CHIMP = res('GCF_C', 9598, 'Pan troglodytes')
const MOUSE = res('GCF_M', 10090, 'Mus musculus')
const CHICKEN = res('GCF_G', 9031, 'Gallus gallus')

// Root-to-taxon ancestor sets, the shape fetchTaxonAncestors returns. Human and
// chimp share four; human and mouse three; human and chicken two.
const LINEAGES = new Map<number, Set<number>>([
  [9606, new Set([1, 7742, 40674, 9443, 9606])],
  [9598, new Set([1, 7742, 40674, 9443, 9598])],
  [10090, new Set([1, 7742, 40674, 9989, 10090])],
  [9031, new Set([1, 7742, 8782, 9031])],
])

test('sharedAncestors counts the overlap, and an unknown lineage scores 0', () => {
  assert.equal(sharedAncestors(LINEAGES, 9606, 9598), 4)
  assert.equal(sharedAncestors(LINEAGES, 9606, 10090), 3)
  assert.equal(sharedAncestors(LINEAGES, 9606, 9031), 2)
  assert.equal(sharedAncestors(LINEAGES, 9606, 99999), 0)
  assert.equal(sharedAncestors(undefined, 9606, 9598), 0)
})

// The whole point of the ordering: chicken used to come first because it sits at
// index 4 of the hand-written COMMON_SPECIES list, ahead of every ape.
test('candidates run closest-first, and exclude the reference', () => {
  const index = pairs({
    'GCF_H,GCF_C': 'hc',
    'GCF_H,GCF_M': 'hm',
    'GCF_H,GCF_G': 'hg',
  })
  const ordered = syntenyCandidates(
    [HUMAN, CHICKEN, MOUSE, CHIMP],
    'GCF_H',
    9606,
    index,
    LINEAGES,
  )
  assert.deepEqual(
    ordered.map(r => r.assembly.scientificName),
    ['Pan troglodytes', 'Mus musculus', 'Gallus gallus'],
  )
})

// A genome no track anywhere reaches can never take a place in the stack, so
// offering it would be offering a checkbox that does nothing.
test('a row with no synteny track at all is not a candidate', () => {
  const lonely = res('GCF_X', 7955, 'Danio rerio')
  const ordered = syntenyCandidates(
    [HUMAN, CHIMP, lonely],
    'GCF_H',
    9606,
    pairs({ 'GCF_H,GCF_C': 'hc' }),
    LINEAGES,
  )
  assert.deepEqual(
    ordered.map(r => r.assembly.accession),
    ['GCF_C'],
  )
})

test('ties break by name, so the same answer sorts the same way twice', () => {
  const a = res('GCF_A', 1001, 'Bos taurus')
  const b = res('GCF_B', 1002, 'Aotus nancymaae')
  const index = pairs({ 'GCF_H,GCF_A': 'ha', 'GCF_H,GCF_B': 'hb' })
  // neither taxon is in LINEAGES, so both score 0 against the reference
  const ordered = syntenyCandidates(
    [HUMAN, a, b],
    'GCF_H',
    9606,
    index,
    LINEAGES,
  )
  assert.deepEqual(
    ordered.map(r => r.assembly.scientificName),
    ['Aotus nancymaae', 'Bos taurus'],
  )
})

test('planFromSelection stacks the reference with the chosen rows', () => {
  const index = pairs({ 'GCF_H,GCF_C': 'hc', 'GCF_H,GCF_M': 'hm' })
  const candidates = syntenyCandidates(
    [HUMAN, CHIMP, MOUSE],
    'GCF_H',
    9606,
    index,
    LINEAGES,
  )
  const { plan, unplaced } = planFromSelection(
    candidates,
    HUMAN,
    new Set(['GCF_C', 'GCF_M']),
    index,
  )
  assert.deepEqual(
    plan?.rows.map(r => r.assembly.scientificName),
    // a star catalog puts the reference in the middle, flanked by its two picks
    ['Mus musculus', 'Homo sapiens', 'Pan troglodytes'],
  )
  assert.deepEqual(unplaced, [])
})

// The stack is a path, so a third species whose only partner is the reference
// cannot be placed once both sides of the reference are taken. Saying so is the
// point — dropping it silently is what made the old auto-chain look arbitrary.
test('a pick the chain cannot place is reported, not dropped silently', () => {
  const index = pairs({
    'GCF_H,GCF_C': 'hc',
    'GCF_H,GCF_M': 'hm',
    'GCF_H,GCF_G': 'hg',
  })
  const candidates = syntenyCandidates(
    [HUMAN, CHIMP, MOUSE, CHICKEN],
    'GCF_H',
    9606,
    index,
    LINEAGES,
  )
  const { plan, unplaced } = planFromSelection(
    candidates,
    HUMAN,
    new Set(['GCF_C', 'GCF_M', 'GCF_G']),
    index,
  )
  assert.equal(plan?.rows.length, 3)
  assert.deepEqual(
    unplaced.map(r => r.assembly.scientificName),
    ['Gallus gallus'],
  )
})

// A chain-shaped catalog has room for all three, so nothing is unplaced.
test('a path-shaped catalog places every pick', () => {
  const index = pairs({
    'GCF_H,GCF_C': 'hc',
    'GCF_C,GCF_M': 'cm',
    'GCF_M,GCF_G': 'mg',
  })
  const candidates = syntenyCandidates(
    [HUMAN, CHIMP, MOUSE, CHICKEN],
    'GCF_H',
    9606,
    index,
    LINEAGES,
  )
  const { plan, unplaced } = planFromSelection(
    candidates,
    HUMAN,
    new Set(['GCF_C', 'GCF_M', 'GCF_G']),
    index,
  )
  assert.deepEqual(
    plan?.rows.map(r => r.assembly.scientificName),
    ['Homo sapiens', 'Pan troglodytes', 'Mus musculus', 'Gallus gallus'],
  )
  assert.deepEqual(unplaced, [])
})

test('an empty selection plans nothing rather than throwing', () => {
  const index = pairs({ 'GCF_H,GCF_C': 'hc' })
  const candidates = syntenyCandidates(
    [HUMAN, CHIMP],
    'GCF_H',
    9606,
    index,
    LINEAGES,
  )
  const { plan, unplaced } = planFromSelection(
    candidates,
    HUMAN,
    new Set(),
    index,
  )
  assert.equal(plan, null)
  assert.deepEqual(unplaced, [])
})

// What a reader is shown before touching anything: the chain the unrestricted
// search would have built, minus the reference, which is always in the launch.
test('the suggestion is the unrestricted chain without the reference', () => {
  const index = pairs({ 'GCF_H,GCF_C': 'hc', 'GCF_C,GCF_M': 'cm' })
  const candidates = syntenyCandidates(
    [HUMAN, CHIMP, MOUSE],
    'GCF_H',
    9606,
    index,
    LINEAGES,
  )
  assert.deepEqual([...suggestedSelection(candidates, HUMAN, index)].sort(), [
    'GCF_C',
    'GCF_M',
  ])
})
