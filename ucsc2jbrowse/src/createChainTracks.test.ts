import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  addChainTracks,
  genarkHubPath,
  genarkLiftOverPifs,
} from './createChainTracks.ts'

import type { FinalizeContext } from './utils/finalizeStep.ts'

const organism = (db: string) => ({ hg38: 'Human' })[db] ?? ''

// `db` is the built dir's name; `name` is what the config calls its assembly,
// the accession for a GenArk-backed alias
function context(dir: string, nibPath: string, db: string, name: string) {
  return {
    assemblyName: db,
    dir,
    genome: { nibPath },
    config: { assemblies: [{ name }], tracks: [] },
  } as unknown as FinalizeContext
}

test('genarkHubPath reads a GenArk-backed nibPath and nothing else', () => {
  assert.equal(
    genarkHubPath('hub:/gbdb/genark/GCF/036/323/735/GCF_036323735.1'),
    'GCF/036/323/735/GCF_036323735.1',
  )
  assert.equal(genarkHubPath('hub:/gbdb/hs1/hubs'), undefined)
  assert.equal(genarkHubPath('/gbdb/rn7'), undefined)
})

test('genarkLiftOverPifs takes only relative liftOver PIFs', () => {
  const pif = (uri: string) => ({
    adapter: { type: 'PairwiseIndexedPAFAdapter', pifGzLocation: { uri } },
  })
  assert.deepEqual(
    genarkLiftOverPifs({
      tracks: [
        pif('liftOver/GCF_1.1ToHg38.pif.gz'),
        pif('https://example.org/liftOver/x.pif.gz'),
        { adapter: { type: 'BigBedAdapter' } },
      ],
    }),
    ['GCF_1.1ToHg38.pif.gz'],
  )
})

test('a GenArk-backed alias names its hub PIFs, under the accession', () => {
  const hubPath = 'GCF/036/323/735/GCF_036323735.1'
  const ctx = context(
    os.tmpdir(),
    `hub:/gbdb/genark/${hubPath}`,
    'rn8',
    'GCF_036323735.1',
  )
  const step = addChainTracks(organism, p =>
    p === hubPath ? ['GCF_036323735.1ToHg38.pif.gz'] : [],
  )
  assert.deepEqual(step.run(ctx), { added: 1 })
  const [track] = ctx.config.tracks as unknown as {
    trackId: string
    name: string
    assemblyNames: string[]
    adapter: { pifGzLocation: { uri: string } }
  }[]
  assert.equal(track!.trackId, 'GCF_036323735.1_to_hg38_liftOver')
  assert.equal(track!.name, 'rn8 to Human (hg38) liftOver')
  assert.deepEqual(track!.assemblyNames, ['GCF_036323735.1', 'hg38'])
  assert.equal(
    track!.adapter.pifGzLocation.uri,
    `https://jbrowse.org/hubs/genark/${hubPath}/liftOver/GCF_036323735.1ToHg38.pif.gz`,
  )
})

test('a golden-path assembly still reads its own liftOver dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-'))
  fs.mkdirSync(path.join(dir, 'liftOver'))
  fs.writeFileSync(path.join(dir, 'liftOver', 'rn7ToHg38.over.pif.gz'), '')
  const ctx = context(dir, '/gbdb/rn7', 'rn7', 'rn7')
  addChainTracks(organism, () => assert.fail('asked a GenArk hub')).run(ctx)
  const [track] = ctx.config.tracks as unknown as {
    adapter: { pifGzLocation: { uri: string } }
  }[]
  assert.equal(
    track!.adapter.pifGzLocation.uri,
    'liftOver/rn7ToHg38.over.pif.gz',
  )
  fs.rmSync(dir, { recursive: true })
})
