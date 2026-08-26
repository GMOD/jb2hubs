import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mergePlugins } from './mergeAll.ts'

import type { JBrowseConfig } from './types.ts'

const LATEST =
  'https://jbrowse.org/plugins/jbrowse-plugin-mafviewer/latest/dist/jbrowse-plugin-mafviewer.umd.production.min.js'
const FROZEN_V1 =
  'https://jbrowse.org/plugins/jbrowse-plugin-mafviewer/dist/jbrowse-plugin-mafviewer.umd.production.min.js'
const UNPKG =
  'https://unpkg.com/jbrowse-plugin-mafviewer/dist/jbrowse-plugin-mafviewer.umd.production.min.js'

function withPlugins(...urls: string[]): JBrowseConfig {
  return {
    assemblies: [],
    tracks: [],
    plugins: urls.map(url => ({ name: 'MafViewer', url })),
  }
}

describe('mergePlugins', () => {
  // The bug: keying the dedupe on JSON.stringify(plugin) made the same plugin
  // under two urls two entries, so all.json asked PluginLoader to install
  // MafViewer/Hubs/Protein3d/MsaView three times each -- once per url variant
  // still present somewhere in configs/.
  it('emits one entry per plugin name, not per distinct url', () => {
    const merged = mergePlugins([
      withPlugins(LATEST),
      withPlugins(FROZEN_V1),
      withPlugins(UNPKG),
    ])
    assert.deepEqual(
      merged.map(p => p.name),
      ['MafViewer'],
    )
  })

  it('keeps the canonical latest/ url whichever order it is seen in', () => {
    for (const configs of [
      [withPlugins(FROZEN_V1), withPlugins(LATEST)],
      [withPlugins(LATEST), withPlugins(FROZEN_V1)],
      [withPlugins(UNPKG), withPlugins(LATEST), withPlugins(FROZEN_V1)],
    ]) {
      assert.deepEqual(mergePlugins(configs), [
        { name: 'MafViewer', url: LATEST },
      ])
    }
  })

  it('falls back to first-seen when no url is canonical', () => {
    assert.deepEqual(
      mergePlugins([withPlugins(UNPKG), withPlugins(FROZEN_V1)]),
      [{ name: 'MafViewer', url: UNPKG }],
    )
  })

  it('keeps distinct plugin names apart', () => {
    const merged = mergePlugins([
      { assemblies: [], tracks: [], plugins: [{ name: 'Hubs', url: LATEST }] },
      withPlugins(LATEST),
    ])
    assert.deepEqual(merged.map(p => p.name).sort(), ['Hubs', 'MafViewer'])
  })

  it('tolerates a config with no plugins key', () => {
    assert.deepEqual(
      mergePlugins([{ assemblies: [], tracks: [] }, withPlugins(LATEST)]),
      [{ name: 'MafViewer', url: LATEST }],
    )
  })
})

// A config regenerated since refs landed and one that predates them both name
// MsaView, and both look "canonical" by the old /latest/dist/ test — so the one
// seen first kept the slot, which for a tree where most configs are old means
// the ref-bearing entry usually lost.
describe('mergePlugins with store refs', () => {
  const REF = {
    name: 'MsaView',
    storePlugin: 'MsaView',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-msaview/latest/dist/jbrowse-plugin-msaview.umd.production.min.js',
  }
  const LATEST_ONLY = {
    name: 'MsaView',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-msaview/latest/dist/jbrowse-plugin-msaview.umd.production.min.js',
  }
  const config = (...plugins: unknown[]): JBrowseConfig => ({
    assemblies: [],
    tracks: [],
    plugins: plugins as JBrowseConfig['plugins'],
  })

  it('prefers a ref over a latest-only entry, whichever is seen first', () => {
    assert.deepEqual(mergePlugins([config(LATEST_ONLY), config(REF)]), [REF])
    assert.deepEqual(mergePlugins([config(REF), config(LATEST_ONLY)]), [REF])
  })

  it('still emits one entry per name', () => {
    assert.equal(mergePlugins([config(REF, LATEST_ONLY)]).length, 1)
  })
})
