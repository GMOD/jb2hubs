import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  CACHE_TTL_MS,
  localChromSizesPath,
  readMitoCache,
  writeMitoCache,
} from './mitoCodes.ts'

function workdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jb2hubs-mito-'))
}

describe('readMitoCache', () => {
  it('starts empty when there is no cache file', () => {
    const cache = readMitoCache(path.join(workdir(), 'absent.json'))
    assert.deepEqual(cache.codes, {})
  })

  it('starts empty on unparseable json rather than throwing', () => {
    // A truncated cache is a cold start, not a failure: every entry is
    // re-derivable from one round of efetch, so refusing here would take the
    // pipeline down over a file it can simply rewrite.
    const dir = workdir()
    const file = path.join(dir, 'cache.json')
    fs.writeFileSync(file, '{"codes": {"9606": 2')
    assert.deepEqual(readMitoCache(file).codes, {})
  })

  it('round-trips codes, including the negative ones', () => {
    // A null means "NCBI answered and this taxon has no MGCId". Dropping it on
    // read would re-query every such taxon on every run, which is most of what
    // the cache exists to prevent.
    const dir = workdir()
    const file = path.join(dir, 'cache.json')
    const now = Date.now()
    writeMitoCache(file, {
      fetchedAt: now,
      codes: { 9606: 2, 7227: 5, 4932: null },
    })
    assert.deepEqual(readMitoCache(file, now).codes, {
      9606: 2,
      7227: 5,
      4932: null,
    })
  })

  it('discards an expired cache', () => {
    const dir = workdir()
    const file = path.join(dir, 'cache.json')
    const written = 1_000_000_000_000
    writeMitoCache(file, { fetchedAt: written, codes: { 9606: 2 } })
    assert.deepEqual(
      readMitoCache(file, written + CACHE_TTL_MS + 1).codes,
      {},
      'past the TTL',
    )
    assert.deepEqual(readMitoCache(file, written + CACHE_TTL_MS - 1).codes, {
      9606: 2,
    })
  })

  it('drops entries that are neither a number nor null', () => {
    // The file is on disk between runs and nothing else validates it. A string
    // code would otherwise flow straight into a config's geneticCodes.
    const dir = workdir()
    const file = path.join(dir, 'cache.json')
    const now = Date.now()
    fs.writeFileSync(
      file,
      JSON.stringify({
        fetchedAt: now,
        codes: { 9606: 2, 7227: 'five', 4932: null, 9031: { code: 2 } },
      }),
    )
    assert.deepEqual(readMitoCache(file, now).codes, { 9606: 2, 4932: null })
  })

  it('starts empty when the file is json but the wrong shape', () => {
    const dir = workdir()
    const file = path.join(dir, 'cache.json')
    fs.writeFileSync(file, JSON.stringify({ codes: { 9606: 2 } })) // no fetchedAt
    assert.deepEqual(readMitoCache(file).codes, {})
  })
})

describe('localChromSizesPath', () => {
  it('resolves a relative chromSizes against the config directory', () => {
    // The post-mirroring shape: mirrorAssemblySidecars rewrote it to a bare file name.
    const dir = workdir()
    fs.writeFileSync(path.join(dir, 'hg38.chrom.sizes'), 'chrM\t16569\n')
    assert.equal(
      localChromSizesPath('hg38.chrom.sizes', dir, 'hg38'),
      path.join(dir, 'hg38.chrom.sizes'),
    )
  })

  it('finds the mirrored copy when the config names the upstream url', () => {
    // The case that matters: the config was rebuilt from
    // scratch, so chromSizes points upstream again -- but the sidecar the
    // previous run mirrored is untouched and still beside it. Without this,
    // every reprocessed assembly costs one hgdownload request.
    const dir = workdir()
    fs.writeFileSync(path.join(dir, 'hg38.chrom.sizes'), 'chrM\t16569\n')
    assert.equal(
      localChromSizesPath(
        'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.chrom.sizes',
        dir,
        'hg38',
      ),
      path.join(dir, 'hg38.chrom.sizes'),
    )
  })

  it('uses mirrorSidecars naming when the url basename lacks the assembly', () => {
    // sidecarFileName namespaces a bare upstream basename with the assembly
    // name, so looking for the basename alone would miss the mirrored file.
    const dir = workdir()
    fs.writeFileSync(path.join(dir, 'ce11.chrom.sizes.txt'), 'chrM\t13794\n')
    assert.equal(
      localChromSizesPath(
        'https://hgdownload.soe.ucsc.edu/goldenPath/ce11/chrom.sizes.txt',
        dir,
        'ce11',
      ),
      path.join(dir, 'ce11.chrom.sizes.txt'),
    )
  })

  it('returns undefined when nothing local exists, so the caller fetches', () => {
    const dir = workdir()
    assert.equal(
      localChromSizesPath(
        'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.chrom.sizes',
        dir,
        'hg38',
      ),
      undefined,
    )
    assert.equal(
      localChromSizesPath('hg38.chrom.sizes', dir, 'hg38'),
      undefined,
    )
  })
})
