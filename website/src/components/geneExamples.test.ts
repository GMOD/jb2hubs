import assert from 'node:assert'
import { test } from 'node:test'

import {
  examplesFor,
  focusFromParams,
  focusToParams,
  showcaseExamples,
} from './geneExamples.ts'

test('focus params: a residue keeps its label through a link', () => {
  const params = new URLSearchParams('gene=HBB')
  focusToParams({ residue: 7, residueLabel: 'E6V (Glu7)' }, params)
  const reread = new URLSearchParams(params.toString())
  assert.deepEqual(focusFromParams(reread), {
    residue: 7,
    residueLabel: 'E6V (Glu7)',
  })
})

test('focus params: an edit rides with its residue, and an unknown one is dropped', () => {
  const params = new URLSearchParams()
  focusToParams({ residue: 213, residueLabel: 'R213*', edit: 'stop' }, params)
  assert.equal(params.get('edit'), 'stop')
  assert.deepEqual(focusFromParams(new URLSearchParams(params)), {
    residue: 213,
    residueLabel: 'R213*',
    edit: 'stop',
  })
  assert.deepEqual(
    focusFromParams(new URLSearchParams('residue=213&edit=delete')),
    { residue: 213 },
  )
  focusToParams({ pfam: 'PF00870' }, params)
  assert.equal(params.get('edit'), null)
})

test('focus params: a bare residue reads back bare, and a new focus clears the label', () => {
  const params = new URLSearchParams('residue=248&label=R248Q')
  focusToParams({ pfam: 'PF00870' }, params)
  assert.equal(params.get('label'), null)
  assert.deepEqual(focusFromParams(new URLSearchParams('residue=248')), {
    residue: 248,
  })
})

test("showcaseExamples: every showcase chip is one of its species' own", () => {
  const showcase = showcaseExamples()
  assert.strictEqual(showcase.length, 8)
  for (const ex of showcase) {
    assert.ok(
      examplesFor(ex.taxId).some(e => e.symbol === ex.symbol && e.focus),
      `${ex.symbol} in ${ex.taxId}`,
    )
  }
})
