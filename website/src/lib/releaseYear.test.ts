import assert from 'node:assert'
import { test } from 'node:test'

import { releaseYear } from './releaseYear.ts'

test('releaseYear reads the first 19xx or 20xx word, else 0', () => {
  assert.equal(releaseYear('Dec. 2013 (GRCh38/hg38)'), 2013)
  assert.equal(releaseYear('Mouse 1999 build'), 1999)
  assert.equal(releaseYear('mm10'), 0)
  assert.equal(releaseYear(null), 0)
})
