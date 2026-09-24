import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  fileExamples,
  formatCheckedDate,
  groupBlockedFiles,
} from './blockedFiles.ts'

const host = 'https://hgdownload.soe.ucsc.edu'

describe('groupBlockedFiles', () => {
  it('groups by directory, most files first, and names the assembly', () => {
    const groups = groupBlockedFiles({
      [`${host}/gbdb/hg38/fantom5/b.bw`]: { blocked: true, lastChecked: 10 },
      [`${host}/gbdb/hg38/fantom5/a.bw`]: { blocked: true, lastChecked: 30 },
      [`${host}/gbdb/hg38/cosmic/cosmic.bb`]: {
        blocked: true,
        lastChecked: 20,
      },
      [`${host}/goldenPath/cb1/bigZips/cb1.2bit`]: {
        blocked: true,
        lastChecked: 5,
      },
    })
    assert.deepEqual(groups, [
      {
        assembly: 'hg38',
        directory: '/gbdb/hg38/fantom5/',
        files: ['a.bw', 'b.bw'],
        lastChecked: 30,
      },
      {
        assembly: 'hg38',
        directory: '/gbdb/hg38/cosmic/',
        files: ['cosmic.bb'],
        lastChecked: 20,
      },
      {
        assembly: 'cb1',
        directory: '/goldenPath/cb1/bigZips/',
        files: ['cb1.2bit'],
        lastChecked: 5,
      },
    ])
  })

  // The cache spells a few keys site-relative, some of them a file it also
  // holds as a full url. They belong with the full urls for the same
  // directory, and a file named both ways is one file.
  it('puts a site-relative key with the full urls of its directory', () => {
    const groups = groupBlockedFiles({
      [`${host}/gbdb/hg19/lovd/lovd.hg19.long.bb`]: {
        blocked: true,
        lastChecked: 1,
      },
      '/gbdb/hg19/lovd/lovd.hg19.long.bb': { blocked: true, lastChecked: 3 },
      '/gbdb/hg19/lovd/lovd.hg19.short.bb': { blocked: true, lastChecked: 2 },
    })
    assert.deepEqual(
      groups.map(({ files, lastChecked }) => ({ files, lastChecked })),
      [{ files: ['lovd.hg19.long.bb', 'lovd.hg19.short.bb'], lastChecked: 3 }],
    )
  })

  it('decodes file names, and keeps one it cannot decode as it is', () => {
    const groups = groupBlockedFiles({
      [`${host}/gbdb/rn6/fantom5/Rat%20Aorta%2c%20donor2.bw`]: {
        blocked: true,
        lastChecked: 1,
      },
      [`${host}/gbdb/rn6/fantom5/100%.bw`]: { blocked: true, lastChecked: 1 },
    })
    assert.deepEqual(groups[0]?.files, ['100%.bw', 'Rat Aorta, donor2.bw'])
  })

  // A checkout whose blockedFiles.json predates the split still holds the
  // accessible entries.
  it('leaves out an entry that is not blocked', () => {
    assert.deepEqual(
      groupBlockedFiles({
        [`${host}/gbdb/hg38/bbi/ok.bb`]: { blocked: false, lastChecked: 1 },
      }),
      [],
    )
  })
})

describe('fileExamples', () => {
  it('lists a few and counts the rest', () => {
    assert.equal(fileExamples(['a', 'b']), 'a, b')
    assert.equal(fileExamples(['a', 'b', 'c']), 'a, b, c')
    assert.equal(fileExamples(['a', 'b', 'c', 'd', 'e']), 'a, b, c and 2 more')
  })
})

describe('formatCheckedDate', () => {
  // 02:30 UTC is still the previous day in the build host's Pacific time.
  it('formats the UTC day', () => {
    assert.equal(
      formatCheckedDate(Date.UTC(2026, 7, 26, 2, 30)),
      'Aug 26, 2026',
    )
  })
})
