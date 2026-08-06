import assert from 'node:assert'
import { test } from 'node:test'

import { paginate } from './paginate.ts'

const rows = Array.from({ length: 25 }, (_, i) => i)

test('slices the requested page', () => {
  assert.deepEqual(
    paginate(rows, 0, 10).pageRows,
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  )
  assert.deepEqual(paginate(rows, 2, 10).pageRows, [20, 21, 22, 23, 24])
  assert.equal(paginate(rows, 0, 10).pageCount, 3)
})

// The tables keep `page` in their own state and only ever clamp on the way out,
// which is what lets a filter shrink the result set under a user sitting on page
// 12 without stranding them on a blank table.
test('a page past the end clamps to the last one', () => {
  const { clampedPage, pageRows, pageCount } = paginate(rows, 99, 10)
  assert.equal(pageCount, 3)
  assert.equal(clampedPage, 2)
  assert.deepEqual(pageRows, [20, 21, 22, 23, 24])
})

test('a negative page clamps to the first', () => {
  assert.equal(paginate(rows, -5, 10).clampedPage, 0)
})

// pageCount floors at 1 so the "Page 1 of 0" that a bare ceil() would produce
// never reaches the pager, and every button stays correctly disabled.
test('an empty list is one empty page, not zero pages', () => {
  const { pageCount, clampedPage, pageRows } = paginate([], 0, 10)
  assert.equal(pageCount, 1)
  assert.equal(clampedPage, 0)
  assert.deepEqual(pageRows, [])
})

test('an exact multiple does not leave a trailing empty page', () => {
  assert.equal(paginate(rows.slice(0, 20), 0, 10).pageCount, 2)
})
