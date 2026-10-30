import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { addDerivedTabixTracks } from './addTabixTrackToConfig.ts'

import type { JBrowseConfig } from './types.ts'

function builtDir(files: string[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabix-tracks-'))
  for (const file of files) {
    fs.writeFileSync(path.join(dir, file), '')
  }
  return dir
}

function trackIds(files: string[]) {
  const config: JBrowseConfig = {
    assemblies: [{ name: 'hg38' }],
    tracks: [],
  } as unknown as JBrowseConfig
  const dir = builtDir(files)
  try {
    addDerivedTabixTracks(config, dir)
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
  return config.tracks.map(track => track.trackId)
}

describe('addDerivedTabixTracks', () => {
  it('adds a track per derived bed and gff file, beds first', () => {
    assert.deepEqual(
      trackIds(['rmsk.gff.gz', 'gap.bed.gz', 'gap.bed.gz.csi']),
      ['hg38-gap', 'hg38-rmsk'],
    )
  })

  it("skips derive.sh's temp files, which a killed run leaves behind", () => {
    assert.deepEqual(
      trackIds(['gap.bed.gz', '.tmp.gap.bed.gz', '.tmp.rmsk.gff.gz']),
      ['hg38-gap'],
    )
  })

  it('leaves the NCBI RefSeq copy to its own step', () => {
    assert.deepEqual(trackIds(['hg38.gff.gz', 'rmsk.gff.gz']), ['hg38-rmsk'])
  })
})
