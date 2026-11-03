import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { addNcbiGffTextSearching } from './ncbiGff.ts'
import {
  TEXT_INDEX_STAMP_FILE,
  recordedTextIndexStamp,
  textIndexStamp,
  textIndexerVersion,
} from './textIndexStamp.ts'

const gff = {
  trackId: 'GCF_000001735.4-ncbiGff',
  type: 'FeatureTrack',
  adapter: { type: 'Gff3TabixAdapter' },
}

describe('textIndexStamp', () => {
  it('is the same for the same policy, whatever else textSearching holds', () => {
    const policy = addNcbiGffTextSearching(gff)
    const adapted = addNcbiGffTextSearching({
      ...gff,
      textSearching: { textSearchAdapter: { type: 'TrixTextSearchAdapter' } },
    })
    assert.equal(
      textIndexStamp('5.0.0-beta.20', [policy]),
      textIndexStamp('5.0.0-beta.20', [adapted]),
    )
  })

  it('changes with the policy, the indexer, or the run attributes', () => {
    const stamp = textIndexStamp('5.0.0-beta.20', [addNcbiGffTextSearching(gff)])
    assert.notEqual(stamp, textIndexStamp('5.0.0-beta.20', [gff]))
    assert.notEqual(
      stamp,
      textIndexStamp('5.0.0-beta.21', [addNcbiGffTextSearching(gff)]),
    )
    assert.notEqual(
      textIndexStamp('5.0.0-beta.20', [gff], ['Name']),
      textIndexStamp('5.0.0-beta.20', [gff], ['Name', 'ID']),
    )
  })

  it('is one word, so it passes through a tab-separated job list', () => {
    assert.match(
      textIndexStamp('5.0.0-beta.20', [addNcbiGffTextSearching(gff)]),
      /^text-indexing-core@5\.0\.0-beta\.20\+[0-9a-f]{16}$/,
    )
  })
})

describe('textIndexerVersion', () => {
  it('is the core the pinned CLI loads', () => {
    const root = path.join(import.meta.dirname, '..', '..')
    assert.ok(
      fs
        .readFileSync(path.join(root, 'package.json'), 'utf8')
        .includes(`"@jbrowse/cli": "${textIndexerVersion()}"`),
    )
  })
})

describe('recordedTextIndexStamp', () => {
  it('reads what textIndex.sh wrote, and nothing where it wrote nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trix-'))
    assert.equal(recordedTextIndexStamp(dir), undefined)
    fs.writeFileSync(path.join(dir, TEXT_INDEX_STAMP_FILE), 'abc\n')
    assert.equal(recordedTextIndexStamp(dir), 'abc')
    fs.rmSync(dir, { recursive: true })
  })
})
