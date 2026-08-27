import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  pickSpeciesTreeFile,
  resolveSpeciesTreeUri,
} from './resolveSpeciesTree.ts'

const base = 'https://hgdownload.soe.ucsc.edu/goldenPath'

// Every listing below is the real one, read off hgdownload's autoindex on
// 2026-08-27. They are the whole argument for a listing over a template: four
// things vary independently across them and no two dbs agree.
const listings = {
  'hg38/multiz470way': [
    'hg38.470way.commonNames.nh',
    'hg38.470way.nh',
    'hg38.470way.scientificNames.nh',
    'maf/',
    'md5sum.txt',
    'multiz470way.bigMaf',
    'multiz470wayFrames.bb',
    'multiz470waySummary.bb',
  ],
  'hg38/cactus447way': [
    'cactus447wayFrames.bb',
    'cactus447waySummary.bb',
    'hg38.447way.commonNames.nh.txt',
    'hg38.447way.nh.txt',
    'hg38.447way.scientificNames.nh.txt',
    'hg38.cactus447way.bb',
  ],
  'hg38/cactus241way': [
    'cactus241way.bigMaf',
    'cactus241wayFrames.bb',
    'hg38.cactus241way.nh',
    'hg38.cactus241way.scientificNames.nh',
  ],
  'hg19/multiz46way': [
    '46way.corrected.nh',
    '46way.nh',
    'commonNames.46way.corrected.nh',
    'commonNames.46way.nh',
  ],
  'mm10/multiz60way': ['mm10.60way.commonNames.nh', 'mm10.60way.nh'],
  'ce11/multiz135way': [
    'ce11.135way.nh',
    'ce11.135way.scientificName.nh',
    'ce11.135way.taxId.nh',
  ],
  'dm6/multiz124way': [
    'dm6.124way.scientificName.nh',
    'dm6.124way.sequenceNames.nh',
    'dm6.124way.taxId.nh',
  ],
  'sacCer3/multiz7way': ['7way.nh'],
  'hg38/phyloP470way': ['md5sum.txt', 'hg38.phyloP470way.bw'],
}

describe('pickSpeciesTreeFile', () => {
  it('picks the tree whose leaves are the ids the MAF rows carry', () => {
    assert.equal(
      pickSpeciesTreeFile(listings['hg38/multiz470way']),
      'hg38.470way.nh',
    )
    assert.equal(
      pickSpeciesTreeFile(listings['hg38/cactus241way']),
      'hg38.cactus241way.nh',
    )
    assert.equal(
      pickSpeciesTreeFile(listings['mm10/multiz60way']),
      'mm10.60way.nh',
    )
    assert.equal(
      pickSpeciesTreeFile(listings['ce11/multiz135way']),
      'ce11.135way.nh',
    )
    assert.equal(pickSpeciesTreeFile(listings['sacCer3/multiz7way']), '7way.nh')
  })

  it('takes a .nh.txt, which is how cactus447way alone spells it', () => {
    assert.equal(
      pickSpeciesTreeFile(listings['hg38/cactus447way']),
      'hg38.447way.nh.txt',
    )
  })

  it('prefers the plain spelling over a qualified sibling', () => {
    // hg19 spells the vocabulary as a PREFIX (commonNames.46way.nh) and carries
    // a second topology (46way.corrected.nh) beside the plain one.
    assert.equal(pickSpeciesTreeFile(listings['hg19/multiz46way']), '46way.nh')
  })

  it('falls back to sequenceNames where UCSC published no plain .nh', () => {
    // dm6's 124way is the case a template misses outright.
    assert.equal(
      pickSpeciesTreeFile(listings['dm6/multiz124way']),
      'dm6.124way.sequenceNames.nh',
    )
  })

  it('returns undefined when the directory holds no tree', () => {
    assert.equal(pickSpeciesTreeFile(listings['hg38/phyloP470way']), undefined)
    assert.equal(pickSpeciesTreeFile([]), undefined)
  })
})

let realFetch: typeof globalThis.fetch
let calls: string[]

function stubFetch(reply: (target: string) => Promise<unknown>) {
  calls = []
  globalThis.fetch = ((target: unknown) => {
    calls.push(String(target))
    return reply(String(target))
  }) as unknown as typeof globalThis.fetch
}

const autoindex = (names: string[]) => () =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () =>
      Promise.resolve(
        `<html><body><h1>Index</h1>
         <a href="?C=N;O=D">Name</a>
         <a href="/goldenPath/hg38/">Parent Directory</a>
         ${names.map(name => `<a href="${name}">${name}</a>`).join('\n')}
         </body></html>`,
      ),
  })
const responds = (status: number) => () =>
  Promise.resolve({ ok: status >= 200 && status < 300, status })
const throws = (message: string) => () => Promise.reject(new Error(message))

beforeEach(() => {
  realFetch = globalThis.fetch
  process.env.CHECK_404 = 'true'
})

afterEach(() => {
  globalThis.fetch = realFetch
  delete process.env.CHECK_404
})

describe('resolveSpeciesTreeUri', () => {
  it('lists the alignment directory once and names the tree it found', async () => {
    stubFetch(autoindex(listings['hg38/multiz470way']))
    assert.equal(
      await resolveSpeciesTreeUri({
        alignmentUri: `${base}/hg38/multiz470way/multiz470way.bigMaf`,
      }),
      `${base}/hg38/multiz470way/hg38.470way.nh`,
    )
    assert.deepEqual(calls, [`${base}/hg38/multiz470way/`])
  })

  it('reads subdirectories and sort controls out of the autoindex', async () => {
    stubFetch(autoindex(listings['hg38/cactus447way']))
    assert.equal(
      await resolveSpeciesTreeUri({
        alignmentUri: `${base}/hg38/cactus447way/hg38.cactus447way.bb`,
      }),
      `${base}/hg38/cactus447way/hg38.447way.nh.txt`,
    )
  })

  it('emits nothing, and asks nothing, for a chainNet bigMaf', async () => {
    // hs1 alone has 27 of these. Their directory is shared with every other
    // bigBed on the assembly and can hold no species tree, so it is never
    // listed.
    stubFetch(autoindex([]))
    assert.equal(
      await resolveSpeciesTreeUri({
        alignmentUri:
          'https://hgdownload.soe.ucsc.edu/gbdb/hs1/chainNet/hs1.GCA_028858775.2.net.bb',
      }),
      undefined,
    )
    assert.deepEqual(calls, [])
  })

  it('emits nothing when the alignment ships no tree', async () => {
    stubFetch(autoindex(['multiz470way.bigMaf', 'md5sum.txt']))
    assert.equal(
      await resolveSpeciesTreeUri({
        alignmentUri: `${base}/hg38/multiz470way/multiz470way.bigMaf`,
      }),
      undefined,
    )
  })

  it('emits nothing on a 404 rather than guessing a name', async () => {
    stubFetch(responds(404))
    assert.equal(
      await resolveSpeciesTreeUri({
        alignmentUri: `${base}/hg38/multiz470way/multiz470way.bigMaf`,
      }),
      undefined,
    )
  })

  it('emits nothing, and remembers nothing, when upstream is having a bad day', async () => {
    // Nothing is cached either way, so a 5xx or a stall costs one build's tree
    // and the next build asks again -- which is the whole reason this needs no
    // 404-vs-transient bookkeeping of its own.
    stubFetch(responds(503))
    assert.equal(
      await resolveSpeciesTreeUri({
        alignmentUri: `${base}/hg38/multiz470way/multiz470way.bigMaf`,
      }),
      undefined,
    )
    stubFetch(throws('ETIMEDOUT'))
    assert.equal(
      await resolveSpeciesTreeUri({
        alignmentUri: `${base}/hg38/multiz470way/multiz470way.bigMaf`,
      }),
      undefined,
    )
  })

  it('touches no network with CHECK_404 unset', async () => {
    delete process.env.CHECK_404
    stubFetch(autoindex(listings['hg38/multiz470way']))
    assert.equal(
      await resolveSpeciesTreeUri({
        alignmentUri: `${base}/hg38/multiz470way/multiz470way.bigMaf`,
      }),
      undefined,
    )
    assert.deepEqual(calls, [])
  })
})
