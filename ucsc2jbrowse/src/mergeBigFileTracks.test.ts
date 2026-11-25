import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isBigBedFile } from './mergeBigFileTracks.ts'

const gbdb = 'https://hgdownload.soe.ucsc.edu/gbdb/hg38'

describe('isBigBedFile', () => {
  it('reads a bigPsl as a bigBed whatever its file is called', () => {
    assert.ok(
      isBigBedFile(
        'bigPsl',
        `${gbdb}/transMap/V5/hg38.refseq.transMapV5.bigPsl`,
      ),
    )
    assert.ok(isBigBedFile('bigPsl', `${gbdb}/uniprot/unipAliSwissprot.bb`))
    assert.ok(isBigBedFile('bigPsl', `${gbdb}/somewhere/alignments.dat`))
  })

  it('reads the bigBed family by extension', () => {
    assert.ok(isBigBedFile('bigGenePred', `${gbdb}/gencode/gencodeV48.bb`))
    assert.ok(isBigBedFile('bigMaf', `${gbdb}/cactus/hg38.bigMaf`))
  })

  it('leaves a bigWig and a bam to their own tracks', () => {
    assert.equal(isBigBedFile('bigWig', `${gbdb}/bbi/gc5Base.bw`), false)
    assert.equal(isBigBedFile('bam', `${gbdb}/bam/reads.bam`), false)
  })
})
