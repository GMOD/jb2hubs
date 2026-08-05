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
