import fs from 'fs'
import path from 'path'

import { dedupe } from 'hubtools'

import { readJSON } from './util.ts'

import type { ConfigExtension, JBrowseConfig } from './types.ts'

const BASE_EXTENSION_DIR = 'ucscExtensions'

/** ucscExtensions/<db>.json, when there is one. */
export function readUcscExtension(assemblyName: string) {
  const file = path.join(BASE_EXTENSION_DIR, `${assemblyName}.json`)
  // An extension is a patch, not a config: read it as one, or a tracks-only
  // extension file throws on `.assemblies[0]` and a file with no `tracks`
  // throws on `.tracks.map`. See ConfigExtension in types.ts.
  return fs.existsSync(file) ? readJSON<ConfigExtension>(file) : undefined
}

/**
 * Merges a hand-authored extension over a generated config: the extension's
 * tracks come first and win on trackId, its assembly-level additions (the
 * cytobands in ucscExtensions/hs1.json) are mixed into the assembly, and its
 * plugins and text search adapters are deduplicated ahead of the config's.
 */
export function applyUcscExtension(
  assemblyName: string,
  existingConfig: JBrowseConfig,
  extensionConfig: ConfigExtension,
): JBrowseConfig {
  // An assembly with no `name` is not a config with no assemblies, it is an
  // assembly jbrowse cannot load, so drop it and say so: spreading two absent
  // assemblies used to emit `[{}]`, and configs/renames.json is what that
  // looked like once it reached the tree and got merged into all.json.
  const mergedAssembly = {
    ...existingConfig.assemblies[0],
    ...extensionConfig.assemblies?.[0],
  }
  const { name } = mergedAssembly
  if (name === undefined) {
    console.warn(
      `${assemblyName}: no named assembly in either the existing config or the extension; writing a config with no assemblies`,
    )
  }

  const existingByTrackId = new Map(
    existingConfig.tracks.map(t => [t.trackId, t]),
  )
  const extensionTracks = (extensionConfig.tracks ?? []).map(t => {
    const existing = existingByTrackId.get(t.trackId)
    return {
      ...existing,
      ...t,
      metadata: {
        ...existing?.metadata,
        ...t.metadata,
        addedByJBrowseTeam: true,
      },
      ...(t.description || existing?.description
        ? { description: t.description ?? existing?.description }
        : {}),
    }
  })

  return {
    ...existingConfig,
    ...extensionConfig,
    assemblies: name === undefined ? [] : [{ ...mergedAssembly, name }],
    tracks: dedupe(
      [...extensionTracks, ...existingConfig.tracks],
      track => track.trackId,
    ),
    plugins: dedupe(
      [...(extensionConfig.plugins ?? []), ...(existingConfig.plugins ?? [])],
      plugin => plugin.name,
    ),
    aggregateTextSearchAdapters: dedupe(
      [
        ...(extensionConfig.aggregateTextSearchAdapters ?? []),
        ...(existingConfig.aggregateTextSearchAdapters ?? []),
      ],
      adapter => adapter.textSearchAdapterId,
    ),
  }
}
