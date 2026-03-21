import {
  AggregateTextSearchAdapter,
  Assembly,
  JBrowseConfig,
  MergeOptions,
  Plugin,
  SyntenyTrack,
  Track,
} from './types.ts'

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = getKey(item)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function parseRegion(pos: string, assemblyName: string) {
  const [refName, range] = pos.split(':')
  const [start, end] = (range ?? '0-10000').split('-').map(Number)
  return { assemblyName, refName, start, end }
}

function mergeAssemblies(configs: JBrowseConfig[]): Assembly[] {
  return dedupeByKey(
    configs.flatMap(c => c.assemblies ?? []),
    a => a.name,
  )
}

function mergeTracks(configs: JBrowseConfig[]): Track[] {
  return dedupeByKey(
    configs.flatMap(c => c.tracks ?? []),
    t => t.trackId,
  )
}

function mergeTextSearchAdapters(
  configs: JBrowseConfig[],
): AggregateTextSearchAdapter[] {
  return dedupeByKey(
    configs.flatMap(c => c.aggregateTextSearchAdapters ?? []),
    a => a.textSearchAdapterId,
  )
}

function mergePlugins(configs: JBrowseConfig[]): Plugin[] {
  return dedupeByKey(
    configs.flatMap(c => c.plugins ?? []),
    p => p.name,
  )
}

function buildSyntenyTracks(
  assemblies: Assembly[],
  syntenyTracks: SyntenyTrack[],
): Track[] {
  const assemblyNames = new Set(assemblies.map(a => a.name))

  return syntenyTracks
    .filter(
      st =>
        st.assemblyNames.length === 2 &&
        st.assemblyNames.every(name => assemblyNames.has(name)),
    )
    .map(st => ({
      type: 'SyntenyTrack',
      trackId: st.trackId,
      name: st.name,
      assemblyNames: st.assemblyNames,
      adapter: st.adapter,
      metadata: st.metadata,
    }))
}

function createDefaultSession(assemblies: Assembly[], sessionType: string) {
  if (sessionType === 'synteny' && assemblies.length >= 2) {
    return {
      name: `Synteny - ${assemblies.map(a => a.name).join(' vs ')}`,
      views: [
        {
          type: 'LinearSyntenyView',
          id: 'syntenyView',
          tracks: [],
          views: assemblies.map((assembly, idx) => ({
            type: 'LinearGenomeView',
            id: `view-${idx}`,
            displayName: assembly.displayName || assembly.name,
            tracks: [],
          })),
        },
      ],
    }
  }

  const first = assemblies[0]
  const defaultPos = (
    first?.sequence?.metadata as { ucsc?: { defaultPos?: string } } | undefined
  )?.ucsc?.defaultPos

  return {
    name: assemblies.map(a => a.name).join(', '),
    views: [
      {
        type: 'LinearGenomeView',
        id: 'initialView',
        ...(first && { displayName: first.displayName || first.name }),
        ...(defaultPos && {
          displayedRegions: [parseRegion(defaultPos, first!.name)],
        }),
      },
    ],
  }
}

export function mergeConfigs(
  configs: JBrowseConfig[],
  options: MergeOptions = {},
): JBrowseConfig {
  if (configs.length === 0) {
    throw new Error('At least one config is required')
  }

  if (
    configs.length === 1 &&
    !options.includeSyntenyTracks &&
    !options.createDefaultSession
  ) {
    return configs[0]!
  }

  const assemblies = mergeAssemblies(configs)
  const tracks = mergeTracks(configs)

  if (options.includeSyntenyTracks && options.syntenyTracks) {
    tracks.push(...buildSyntenyTracks(assemblies, options.syntenyTracks))
  }

  const plugins = mergePlugins(configs)

  const mergedConfig: JBrowseConfig = {
    assemblies,
    tracks,
    aggregateTextSearchAdapters: mergeTextSearchAdapters(configs),
    ...(plugins.length > 0 && { plugins }),
  }

  if (options.createDefaultSession) {
    mergedConfig.defaultSession = createDefaultSession(
      assemblies,
      options.sessionType ?? 'linear',
    )
  }

  return mergedConfig
}
