import {
  JBrowseConfig,
  Assembly,
  Track,
  SyntenyTrack,
  AggregateTextSearchAdapter,
  MergeOptions,
} from './types'

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
  const [refName, range = '0-10000'] = pos.split(':')
  const [start, end] = range.split('-').map(Number)
  return { assemblyName, refName, start, end }
}

export class ConfigMerger {
  mergeConfigs(configs: JBrowseConfig[], options: MergeOptions = {}): JBrowseConfig {
    if (configs.length === 0) {
      throw new Error('At least one config is required')
    }

    if (configs.length === 1 && !options.includeSyntenyTracks) {
      return configs[0]!
    }

    const assemblies = this.mergeAssemblies(configs)
    const tracks = this.mergeTracks(configs)

    if (options.includeSyntenyTracks && options.syntenyTracks) {
      tracks.push(...this.buildSyntenyTracks(assemblies, options.syntenyTracks))
    }

    const mergedConfig: JBrowseConfig = {
      assemblies,
      tracks,
      aggregateTextSearchAdapters: this.mergeTextSearchAdapters(configs),
    }

    if (options.createDefaultSession) {
      mergedConfig.defaultSession = this.createDefaultSession(
        assemblies,
        options.sessionType || 'linear',
      )
    }

    return mergedConfig
  }

  private mergeAssemblies(configs: JBrowseConfig[]): Assembly[] {
    return dedupeByKey(
      configs.flatMap(c => c.assemblies ?? []),
      a => a.name,
    )
  }

  private mergeTracks(configs: JBrowseConfig[]): Track[] {
    return dedupeByKey(
      configs.flatMap(c => c.tracks ?? []),
      t => t.trackId,
    )
  }

  private mergeTextSearchAdapters(
    configs: JBrowseConfig[],
  ): AggregateTextSearchAdapter[] {
    return dedupeByKey(
      configs.flatMap(c => c.aggregateTextSearchAdapters ?? []),
      a => a.textSearchAdapterId,
    )
  }

  private buildSyntenyTracks(
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

  private createDefaultSession(assemblies: Assembly[], sessionType: string) {
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
    const defaultPos = (first?.sequence?.metadata as { ucsc?: { defaultPos?: string } })?.ucsc?.defaultPos

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
}
