import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { addSexChromosomes } from './addSexChromosomes.ts'

import type { JBrowseConfig, TransmissionEntry } from './types.ts'

function run(assemblyName: string, transmission?: TransmissionEntry[]) {
  const config: JBrowseConfig = {
    tracks: [],
    assemblies: [{ name: assemblyName, transmission }],
  }
  addSexChromosomes.run({
    assemblyName,
    dir: '',
    dbDir: '',
    genome: undefined,
    tracksDb: undefined,
    mitoCache: { codes: {}, fetchedAt: 0 },
    compareOnly: false,
    config,
  })
  return config.assemblies[0]!.transmission
}

describe('addSexChromosomes', () => {
  it('puts the sex chromosomes of an XY db before its mitochondrion', () => {
    assert.deepEqual(run('hg38', [{ refName: 'chrM', from: 'either' }]), [
      { refName: 'chrX', sex: 'male', from: 'mother' },
      { refName: 'chrY', sex: 'male', from: 'father' },
      { refName: 'chrM', from: 'either' },
    ])
  })

  it('gives a ZW db its female-heterogametic entries', () => {
    assert.deepEqual(run('galGal6'), [
      { refName: 'chrZ', sex: 'female', from: 'father' },
      { refName: 'chrW', sex: 'female', from: 'mother' },
    ])
  })

  it('reads nothing into a chrX the table does not name', () => {
    assert.equal(run('sacCer3'), undefined)
  })
})
