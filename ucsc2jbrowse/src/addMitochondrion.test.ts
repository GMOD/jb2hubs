import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { addMitochondrion } from './addMitochondrion.ts'

import type { JBrowseConfig } from './types.ts'

// One assembly whose chrom.sizes is a file beside its config, so the step
// reads it from disk and never reaches the network.
async function run(
  chromSizes: string,
  taxId: number,
  codes: Record<string, number | null>,
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb2hubs-mito-'))
  fs.writeFileSync(path.join(dir, 'hg.chrom.sizes'), chromSizes)
  const config: JBrowseConfig = {
    tracks: [],
    assemblies: [
      {
        name: 'hg',
        sequence: {
          type: 'ReferenceSequenceTrack',
          trackId: 'hg-ref',
          metadata: { taxId },
          adapter: { chromSizes: 'hg.chrom.sizes' },
        },
      },
    ],
  }
  await addMitochondrion.run({
    assemblyName: 'hg',
    dir,
    dbDir: dir,
    genome: undefined,
    tracksDb: undefined,
    mitoCache: { codes, fetchedAt: Date.now() },
    compareOnly: false,
    config,
  })
  return config.assemblies[0]!
}

describe('addMitochondrion', () => {
  it('marks the mito contig circular and gives it the taxon code', async () => {
    const assembly = await run('chr1\t100\nchrM\t16569\n', 9606, { 9606: 2 })
    assert.deepEqual(assembly.circularRefNames, ['chrM'])
    assert.deepEqual(assembly.geneticCodes, { chrM: 2 })
  })

  it('marks it circular when the taxon uses the standard code', async () => {
    const assembly = await run('chr1\t100\nchrMT\t16569\n', 4577, { 4577: 1 })
    assert.deepEqual(assembly.circularRefNames, ['chrMT'])
    assert.equal(assembly.geneticCodes, undefined)
  })

  it('leaves an assembly with no mito contig alone', async () => {
    const assembly = await run('chr1\t100\n', 9606, { 9606: 2 })
    assert.equal(assembly.circularRefNames, undefined)
    assert.equal(assembly.geneticCodes, undefined)
  })
})
