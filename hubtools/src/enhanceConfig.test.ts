import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { enhanceConfig } from './enhanceConfig.ts'

function runOnConfig(tracks: unknown[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enhance-'))
  const file = path.join(dir, 'config.json')
  fs.writeFileSync(file, JSON.stringify({ tracks }))
  enhanceConfig(file, [])
  return JSON.parse(fs.readFileSync(file, 'utf8')).tracks
}

function runOnPlugins(
  config: unknown,
  plugins: { name: string; url: string }[],
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'enhance-'))
  const file = path.join(dir, 'config.json')
  fs.writeFileSync(file, JSON.stringify(config))
  enhanceConfig(file, plugins)
  return JSON.parse(fs.readFileSync(file, 'utf8')).plugins
}

describe('enhanceConfig feature display derivation', () => {
  it('derives a display for a FeatureTrack from metadata.ucsc', () => {
    const [t] = runOnConfig([
      {
        trackId: 'a-ncbiGene',
        type: 'FeatureTrack',
        metadata: { ucsc: { defaultLabelFields: 'geneName2' } },
      },
    ])
    assert.equal(t.displays[0].labels.name, "jexl:get(feature,'geneName2')")
  })

  it('leaves a hand-authored display untouched', () => {
    const existing = [{ type: 'LinearBasicDisplay', displayId: 'custom' }]
    const [t] = runOnConfig([
      {
        trackId: 'a-ncbiGene',
        type: 'FeatureTrack',
        displays: existing,
        metadata: { ucsc: { defaultLabelFields: 'geneName2' } },
      },
    ])
    assert.deepEqual(t.displays, existing)
  })

  it('skips non-FeatureTracks and tracks without ucsc metadata', () => {
    const [variant, plain] = runOnConfig([
      {
        trackId: 'a-vcf',
        type: 'VariantTrack',
        metadata: { ucsc: { defaultLabelFields: 'name' } },
      },
      { trackId: 'a-x', type: 'FeatureTrack' },
    ])
    assert.equal(variant.displays, undefined)
    assert.equal(plain.displays, undefined)
  })
})

describe('enhanceConfig repeat-class display gate', () => {
  const rmsk = {
    trackId: 'hg38-rmsk',
    type: 'FeatureTrack',
    adapter: { type: 'BedTabixAdapter', bedGzLocation: { uri: 'rmsk.bed.gz' } },
  }
  function withEnv<T>(value: string | undefined, fn: () => T) {
    const before = process.env.RMSK_MULTIROW_DISPLAY
    if (value === undefined) {
      delete process.env.RMSK_MULTIROW_DISPLAY
    } else {
      process.env.RMSK_MULTIROW_DISPLAY = value
    }
    try {
      return fn()
    } finally {
      if (before === undefined) {
        delete process.env.RMSK_MULTIROW_DISPLAY
      } else {
        process.env.RMSK_MULTIROW_DISPLAY = before
      }
    }
  }

  // The gate is the whole point: an unreleased display type in `displays[]` is a
  // fatal MST union error on every host that lacks it, so the production pass
  // must not write one. See the comment in enhanceConfig.ts.
  it('writes no display without the env var', () => {
    const [t] = withEnv(undefined, () => runOnConfig([rmsk]))
    assert.equal(t.displays, undefined)
  })

  it('writes the by-class display with it', () => {
    const [t] = withEnv('1', () => runOnConfig([rmsk]))
    assert.deepEqual(
      t.displays.map((d: { type: string }) => d.type),
      ['LinearBasicDisplay', 'LinearMultiRowFeatureDisplay'],
    )
  })
})

describe('enhanceConfig plugins', () => {
  it('rewrites the url of a plugin the config already names', () => {
    const plugins = runOnPlugins(
      { tracks: [], plugins: [{ name: 'Protein3d', url: 'old' }] },
      [{ name: 'Protein3d', url: 'new' }],
    )
    assert.deepEqual(plugins, [{ name: 'Protein3d', url: 'new' }])
  })

  it('appends a plugin the config does not name', () => {
    const plugins = runOnPlugins(
      { tracks: [], plugins: [{ name: 'Hubs', url: 'hubs' }] },
      [{ name: 'Protein3d', url: 'p3d' }],
    )
    assert.deepEqual(plugins, [
      { name: 'Hubs', url: 'hubs' },
      { name: 'Protein3d', url: 'p3d' },
    ])
  })
})
