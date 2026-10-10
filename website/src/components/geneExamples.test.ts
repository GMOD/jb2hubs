import assert from 'node:assert'
import { test } from 'node:test'

import { focusFromParams, focusToParams } from './geneExamples.ts'

test('focus params: a residue keeps its label through a link', () => {
  const params = new URLSearchParams('gene=HBB')
  focusToParams({ residue: 7, residueLabel: 'E6V (Glu7)' }, params)
  const reread = new URLSearchParams(params.toString())
  assert.deepEqual(focusFromParams(reread), {
    residue: 7,
    residueLabel: 'E6V (Glu7)',
  })
})

test('focus params: a bare residue reads back bare, and a new focus clears the label', () => {
  const params = new URLSearchParams('residue=248&label=R248Q')
  focusToParams({ pfam: 'PF00870' }, params)
  assert.equal(params.get('label'), null)
  assert.deepEqual(focusFromParams(new URLSearchParams('residue=248')), {
    residue: 248,
  })
})
