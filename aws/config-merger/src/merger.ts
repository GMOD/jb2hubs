import {
  JBrowseConfig,
  Assembly,
  Track,
  SyntenyTrack,
  AggregateTextSearchAdapter,
  MergeOptions,
} from './types'

export class ConfigMerger {
  mergeConfigs(configs: JBrowseConfig[], options: MergeOptions = {}): JBrowseConfig {
    if (configs.length === 0) {
      throw new Error('At least one config is required')
    }

    if (configs.length === 1 && !options.includeSyntenyTracks) {
      return configs[0]
    }

    const mergedConfig: JBrowseConfig = {
      assemblies: this.mergeAssemblies(configs),
      tracks: this.mergeTracks(configs, options),
      aggregateTextSearchAdapters: this.mergeTextSearchAdapters(configs),
    }

    if (options.createDefaultSession) {
      mergedConfig.defaultSession = this.createDefaultSession(
        mergedConfig.assemblies || [],
        options.sessionType || 'linear'
      )
    }

    return mergedConfig
  }

  private mergeAssemblies(configs: JBrowseConfig[]): Assembly[] {
    const assemblyMap = new Map<string, Assembly>()

    for (const config of configs) {
      if (!config.assemblies) continue

      for (const assembly of config.assemblies) {
        if (!assemblyMap.has(assembly.name)) {
          assemblyMap.set(assembly.name, assembly)
        }
      }
    }

    return Array.from(assemblyMap.values())
  }

  private mergeTracks(configs: JBrowseConfig[], options: MergeOptions): Track[] {
    const trackMap = new Map<string, Track>()

    for (const config of configs) {
      if (!config.tracks) continue

      for (const track of config.tracks) {
        if (!trackMap.has(track.trackId)) {
          trackMap.set(track.trackId, track)
        }
      }
    }

    const tracks = Array.from(trackMap.values())

    if (options.includeSyntenyTracks && options.syntenyTracks) {
      const assemblies = this.mergeAssemblies(configs)
      const assemblyNames = new Set(assemblies.map(a => a.name))

      const relevantSyntenyTracks = options.syntenyTracks.filter(track => {
        return (
          track.assemblyNames.length === 2 &&
          track.assemblyNames.every(name => assemblyNames.has(name))
        )
      })

      for (const syntenyTrack of relevantSyntenyTracks) {
        const track: Track = {
          type: 'SyntenyTrack',
          trackId: syntenyTrack.trackId,
          name: syntenyTrack.name,
          assemblyNames: syntenyTrack.assemblyNames,
          adapter: syntenyTrack.adapter,
        }

        if (syntenyTrack.metadata) {
          track.metadata = syntenyTrack.metadata
        }

        tracks.push(track)
      }
    }

    return tracks
  }

  private mergeTextSearchAdapters(configs: JBrowseConfig[]): AggregateTextSearchAdapter[] {
    const adapterMap = new Map<string, AggregateTextSearchAdapter>()

    for (const config of configs) {
      if (!config.aggregateTextSearchAdapters) continue

      for (const adapter of config.aggregateTextSearchAdapters) {
        if (!adapterMap.has(adapter.textSearchAdapterId)) {
          adapterMap.set(adapter.textSearchAdapterId, adapter)
        }
      }
    }

    return Array.from(adapterMap.values())
  }

  private createDefaultSession(assemblies: Assembly[], sessionType: 'linear' | 'synteny') {
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

    const firstAssembly = assemblies[0]
    const defaultPos =
      firstAssembly?.sequence?.metadata &&
      typeof firstAssembly.sequence.metadata === 'object' &&
      'ucsc' in firstAssembly.sequence.metadata &&
      firstAssembly.sequence.metadata.ucsc &&
      typeof firstAssembly.sequence.metadata.ucsc === 'object' &&
      'defaultPos' in firstAssembly.sequence.metadata.ucsc
        ? String(firstAssembly.sequence.metadata.ucsc.defaultPos)
        : undefined

    return {
      name: assemblies.map(a => a.name).join(', '),
      views: [
        {
          type: 'LinearGenomeView',
          id: 'initialView',
          ...(firstAssembly && {
            displayName: firstAssembly.displayName || firstAssembly.name,
          }),
          ...(defaultPos && {
            displayedRegions: [
              {
                assemblyName: firstAssembly.name,
                refName: defaultPos.split(':')[0],
                start: parseInt(defaultPos.split(':')[1]?.split('-')[0] || '0'),
                end: parseInt(defaultPos.split(':')[1]?.split('-')[1] || '10000'),
              },
            ],
          }),
        },
      ],
    }
  }
}
