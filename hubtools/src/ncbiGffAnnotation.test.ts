import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { gzipSync } from 'node:zlib'

import {
  parseNcbiGffAnnotation,
  readNcbiGffAnnotation,
} from './ncbiGffAnnotation.ts'

// The three header shapes the GenArk corpus holds, copied from real files.
const refseq = `##gff-version 3
#!gff-spec-version 1.21
#!processor NCBI annotwriter
#!genome-build ASM2007630v1
#!genome-build-accession NCBI_Assembly:GCF_020076305.1
#!annotation-date 11/22/2025 09:42:57
#!annotation-source NCBI RefSeq GCF_020076305.1-RS_2025_11_22
##sequence-region NZ_JAIQXE010000001.1 1 2266000
NZ_JAIQXE010000001.1\tRefSeq\tregion\t1\t2266000\t.\t+\t.\tID=x
`
const flybase = `##gff-version 3
#!gff-spec-version 1.21
#!processor NCBI annotwriter
#!genome-build Release 6 plus ISO1 MT
#!genome-build-accession NCBI_Assembly:GCF_000001215.4
#!annotation-source FlyBase Release 6.54
##sequence-region NC_004354.4 1 23542271
`
const bare = `##gff-version 3
#!gff-spec-version 1.21
#!processor NCBI annotwriter
#!genome-build ViralProj16651
#!genome-build-accession NCBI_Assembly:GCF_000864585.1
##sequence-region NC_007918.1 1 16067
`

describe('parseNcbiGffAnnotation', () => {
  it('reads the source and an ISO date from a RefSeq header', () => {
    assert.deepEqual(parseNcbiGffAnnotation(refseq), {
      annotationSource: 'NCBI RefSeq GCF_020076305.1-RS_2025_11_22',
      annotationDate: '2025-11-22',
    })
  })

  it('reads a source with no date', () => {
    assert.deepEqual(parseNcbiGffAnnotation(flybase), {
      annotationSource: 'FlyBase Release 6.54',
    })
  })

  it('says nothing for a header without either', () => {
    assert.equal(parseNcbiGffAnnotation(bare), undefined)
  })

  it('stops at the first record', () => {
    const text = `##gff-version 3\nchr1\t.\tgene\t1\t2\t.\t+\t.\tID=a\n#!annotation-source late\n`
    assert.equal(parseNcbiGffAnnotation(text), undefined)
  })
})

describe('readNcbiGffAnnotation', () => {
  it('reads the header from a file of several gzip members cut short', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ncbi-gff-'))
    const file = path.join(dir, 'a.gff.gz')
    // A second member far past the bytes read, as in a bgzipped GFF.
    const tail = gzipSync(
      Array.from({ length: 200_000 }, (_, i) => `r${i}\t${Math.random()}`).join(
        '\n',
      ),
    )
    fs.writeFileSync(file, Buffer.concat([gzipSync(refseq), tail]))
    assert.ok(fs.statSync(file).size > 1 << 16)
    assert.deepEqual(readNcbiGffAnnotation(file), {
      annotationSource: 'NCBI RefSeq GCF_020076305.1-RS_2025_11_22',
      annotationDate: '2025-11-22',
    })
    fs.rmSync(dir, { recursive: true })
  })
})
