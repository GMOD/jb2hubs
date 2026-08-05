import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  assemblySidecars,
  mirrorAssemblySidecars,
  sidecarFileName,
} from './mirrorSidecars.ts'

const makeAssembly = () => ({
  name: 'hg38',
  sequence: {
    adapter: {
      type: 'TwoBitAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.2bit',
      chromSizes:
        'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.chrom.sizes',
    },
  },
  refNameAliases: {
    adapter: {
      type: 'RefNameAliasAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.chromAlias.txt',
    },
  },
  cytobands: {
    adapter: {
      type: 'CytobandAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/cytoBand.txt.gz',
    },
  },
})

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sidecars-'))

// every one of these is fetched by assembly.loadPre()'s Promise.all, where a
// single rejection fails the whole assembly
describe('assemblySidecars', () => {
  it('finds all three load-blocking files', () => {
    assert.deepEqual(
      assemblySidecars(makeAssembly()).map(s => s.label),
      ['chromSizes', 'refNameAliases', 'cytobands'],
    )
  })

  it('skips fields the assembly does not have', () => {
    const assembly = { name: 'foo', sequence: { adapter: { uri: 'x.2bit' } } }
    assert.deepEqual(assemblySidecars(assembly), [])
  })
})

describe('sidecarFileName', () => {
  it('keeps an already-namespaced basename', () => {
    assert.equal(
      sidecarFileName('hg38', 'https://x/goldenPath/hg38/hg38.chrom.sizes'),
      'hg38.chrom.sizes',
    )
  })

  // database/cytoBand.txt.gz shares a directory with the derived track files
  // once mirrored, so a bare basename has to be namespaced
  it('namespaces a bare basename', () => {
    assert.equal(
      sidecarFileName(
        'hg38',
        'https://x/goldenPath/hg38/database/cytoBand.txt.gz',
      ),
      'hg38.cytoBand.txt.gz',
    )
  })
})

describe('mirrorAssemblySidecars', () => {
  it('writes local copies and rewrites the config to name them', async () => {
    const dir = tmpdir()
    const assembly = makeAssembly()
    const result = await mirrorAssemblySidecars({
      assembly,
      dir,
      provideLocal: ({ file }) => Buffer.from(`contents of ${file}`),
    })

    assert.equal(result.changed, true)
    assert.deepEqual(result.failed, [])
    assert.equal(assembly.sequence.adapter.chromSizes, 'hg38.chrom.sizes')
    assert.equal(assembly.refNameAliases.adapter.uri, 'hg38.chromAlias.txt')
    assert.equal(assembly.cytobands.adapter.uri, 'hg38.cytoBand.txt.gz')
    // the 2bit is deliberately left upstream
    assert.match(assembly.sequence.adapter.uri, /^https:\/\/hgdownload/)
    assert.equal(
      fs.readFileSync(path.join(dir, 'hg38.chrom.sizes'), 'utf8'),
      'contents of hg38.chrom.sizes',
    )
  })

  it('reuses an existing mirrored file without fetching', async () => {
    const dir = tmpdir()
    fs.writeFileSync(path.join(dir, 'hg38.chrom.sizes'), 'chr1\t1000\n')
    const assembly = makeAssembly()
    let provided = 0
    await mirrorAssemblySidecars({
      assembly,
      dir,
      provideLocal: ({ file }) => {
        provided++
        return Buffer.from(file)
      },
    })
    assert.equal(provided, 2) // chromAlias and cytoBand, not chrom.sizes
    assert.equal(assembly.sequence.adapter.chromSizes, 'hg38.chrom.sizes')
    assert.equal(
      fs.readFileSync(path.join(dir, 'hg38.chrom.sizes'), 'utf8'),
      'chr1\t1000\n',
    )
  })

  // an unreachable file must leave the config working as well as it did
  // before, not naming a local file that isn't there
  it('leaves a failed sidecar pointing upstream', async () => {
    const dir = tmpdir()
    const assembly = makeAssembly()
    const warnings: string[] = []
    const result = await mirrorAssemblySidecars({
      assembly,
      dir,
      provideLocal: ({ file }) =>
        file === 'hg38.chrom.sizes' ? Buffer.from('chr1\t1\n') : undefined,
      download: () => Promise.reject(new Error('hgdownload is down')),
      onWarn: msg => warnings.push(msg),
    })
    assert.equal(assembly.sequence.adapter.chromSizes, 'hg38.chrom.sizes')
    assert.deepEqual(result.failed, ['refNameAliases', 'cytobands'])
    assert.match(assembly.refNameAliases.adapter.uri, /^https:\/\/hgdownload/)
    assert.match(assembly.cytobands.adapter.uri, /^https:\/\/hgdownload/)
    assert.equal(warnings.length, 2)
  })

  it('is idempotent over an already-mirrored config', async () => {
    const dir = tmpdir()
    const assembly = makeAssembly()
    const opts = {
      assembly,
      dir,
      provideLocal: ({ file }: { file: string }) => Buffer.from(file),
    }
    await mirrorAssemblySidecars(opts)
    const first = JSON.stringify(assembly)
    const second = await mirrorAssemblySidecars(opts)
    assert.equal(JSON.stringify(assembly), first)
    assert.deepEqual(second.failed, [])
  })
})
