import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import zlib from 'node:zlib'

import { makeTableFileResolver } from './resolveTableBigFile.ts'

const baseUrl = 'https://hgdownload.soe.ucsc.edu'

function tableDir(tables: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb2hubs-tables-'))
  for (const [name, contents] of Object.entries(tables)) {
    fs.writeFileSync(
      path.join(dir, `${name}.txt.gz`),
      zlib.gzipSync(Buffer.from(contents)),
    )
  }
  return dir
}

describe('makeTableFileResolver', () => {
  it('resolves a one-row table to an absolute url', () => {
    // the real shape: a single `fileName` column
    const dbDir = tableDir({
      wgEncodeBroadHistoneGm12878H3k27acStdSig:
        '/gbdb/hg19/bbi/wgEncodeBroadHistoneGm12878H3k27acStdSig.bigWig\n',
    })
    const resolve = makeTableFileResolver({ dbDir, baseUrl })
    assert.equal(
      resolve('wgEncodeBroadHistoneGm12878H3k27acStdSig'),
      'https://hgdownload.soe.ucsc.edu/gbdb/hg19/bbi/wgEncodeBroadHistoneGm12878H3k27acStdSig.bigWig',
    )
  })

  it('finds the path when it is not the first column', () => {
    const dbDir = tableDir({ t: 'chr1\t/gbdb/hg19/bbi/t.bigWig\n' })
    assert.equal(
      makeTableFileResolver({ dbDir, baseUrl })('t'),
      'https://hgdownload.soe.ucsc.edu/gbdb/hg19/bbi/t.bigWig',
    )
  })

  it('resolves a table repeating one path across rows', () => {
    const dbDir = tableDir({
      t: 'chr1\t/gbdb/hg19/bbi/t.bigWig\nchr2\t/gbdb/hg19/bbi/t.bigWig\n',
    })
    assert.equal(
      makeTableFileResolver({ dbDir, baseUrl })('t'),
      'https://hgdownload.soe.ucsc.edu/gbdb/hg19/bbi/t.bigWig',
    )
  })

  it('refuses a table split across sequences', () => {
    // two different files can't become one adapter, and picking either would be
    // a track that silently covers one chromosome
    const dbDir = tableDir({
      t: 'chr1\t/gbdb/hg19/bbi/t1.bigWig\nchr2\t/gbdb/hg19/bbi/t2.bigWig\n',
    })
    assert.equal(makeTableFileResolver({ dbDir, baseUrl })('t'), undefined)
  })

  it('returns undefined for a missing table or one with no path', () => {
    const dbDir = tableDir({ empty: '\n', noPath: 'somevalue\t42\n' })
    const resolve = makeTableFileResolver({ dbDir, baseUrl })
    assert.equal(resolve('doesNotExist'), undefined)
    assert.equal(resolve('empty'), undefined)
    assert.equal(resolve('noPath'), undefined)
  })

  it('reads each table once', () => {
    const dbDir = tableDir({ t: '/gbdb/hg19/bbi/t.bigWig\n' })
    const resolve = makeTableFileResolver({ dbDir, baseUrl })
    const first = resolve('t')
    fs.rmSync(path.join(dbDir, 't.txt.gz'))
    // the file is gone, so an identical second answer can only come from cache
    assert.equal(resolve('t'), first)
  })
})
