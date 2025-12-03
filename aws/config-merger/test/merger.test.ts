import { describe, expect, it } from 'vitest'

import { addRelativeUris, idToConfigUrl } from '../src/index.ts'
import { mergeConfigs } from '../src/merger.ts'
import { Assembly, JBrowseConfig, SyntenyTrack } from '../src/types.ts'

function makeAssembly(name: string, displayName?: string): Assembly {
  return {
    name,
    displayName,
    sequence: {
      type: 'ReferenceSequenceTrack',
      trackId: `${name}-seq`,
      adapter: { type: 'IndexedFastaAdapter', uri: `${name}.fa` },
    },
  }
}

describe('mergeConfigs', () => {
  it('throws when no configs provided', () => {
    expect(() => mergeConfigs([])).toThrow('At least one config is required')
  })

  it('returns single config unchanged when no synteny tracks requested', () => {
    const config: JBrowseConfig = {
      assemblies: [makeAssembly('hg38')],
      tracks: [
        {
          trackId: 'genes',
          name: 'Genes',
          type: 'FeatureTrack',
          assemblyNames: ['hg38'],
        },
      ],
    }
    const result = mergeConfigs([config])
    expect(result).toBe(config)
  })

  it('merges assemblies from multiple configs', () => {
    const config1: JBrowseConfig = { assemblies: [makeAssembly('hg38')] }
    const config2: JBrowseConfig = { assemblies: [makeAssembly('mm10')] }

    const result = mergeConfigs([config1, config2])

    expect(result.assemblies).toHaveLength(2)
    expect(result.assemblies?.map(a => a.name)).toEqual(['hg38', 'mm10'])
  })

  it('deduplicates assemblies by name', () => {
    const config1: JBrowseConfig = {
      assemblies: [makeAssembly('hg38', 'Human')],
    }
    const config2: JBrowseConfig = {
      assemblies: [makeAssembly('hg38', 'Human v2')],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.assemblies).toHaveLength(1)
    expect(result.assemblies?.[0]?.displayName).toBe('Human')
  })

  it('merges tracks from multiple configs', () => {
    const config1: JBrowseConfig = {
      tracks: [
        {
          trackId: 'genes',
          name: 'Genes',
          type: 'FeatureTrack',
          assemblyNames: ['hg38'],
        },
      ],
    }
    const config2: JBrowseConfig = {
      tracks: [
        {
          trackId: 'variants',
          name: 'Variants',
          type: 'VariantTrack',
          assemblyNames: ['hg38'],
        },
      ],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.tracks).toHaveLength(2)
    expect(result.tracks?.map(t => t.trackId)).toEqual(['genes', 'variants'])
  })

  it('deduplicates tracks by trackId', () => {
    const config1: JBrowseConfig = {
      tracks: [
        {
          trackId: 'genes',
          name: 'Genes v1',
          type: 'FeatureTrack',
          assemblyNames: ['hg38'],
        },
      ],
    }
    const config2: JBrowseConfig = {
      tracks: [
        {
          trackId: 'genes',
          name: 'Genes v2',
          type: 'FeatureTrack',
          assemblyNames: ['hg38'],
        },
      ],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.tracks).toHaveLength(1)
    expect(result.tracks?.[0]?.name).toBe('Genes v1')
  })

  it('merges aggregateTextSearchAdapters', () => {
    const config1: JBrowseConfig = {
      aggregateTextSearchAdapters: [
        {
          type: 'TrixTextSearchAdapter',
          textSearchAdapterId: 'search1',
          assemblyNames: ['hg38'],
        },
      ],
    }
    const config2: JBrowseConfig = {
      aggregateTextSearchAdapters: [
        {
          type: 'TrixTextSearchAdapter',
          textSearchAdapterId: 'search2',
          assemblyNames: ['mm10'],
        },
      ],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.aggregateTextSearchAdapters).toHaveLength(2)
  })

  it('deduplicates text search adapters', () => {
    const config1: JBrowseConfig = {
      aggregateTextSearchAdapters: [
        {
          type: 'TrixTextSearchAdapter',
          textSearchAdapterId: 'search1',
          assemblyNames: ['hg38'],
        },
      ],
    }
    const config2: JBrowseConfig = {
      aggregateTextSearchAdapters: [
        {
          type: 'TrixTextSearchAdapter',
          textSearchAdapterId: 'search1',
          assemblyNames: ['hg38'],
        },
      ],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.aggregateTextSearchAdapters).toHaveLength(1)
  })

  it('handles configs with missing optional fields', () => {
    const config1: JBrowseConfig = { assemblies: [makeAssembly('hg38')] }
    const config2: JBrowseConfig = {
      tracks: [
        {
          trackId: 'genes',
          name: 'Genes',
          type: 'FeatureTrack',
          assemblyNames: ['hg38'],
        },
      ],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.assemblies).toHaveLength(1)
    expect(result.tracks).toHaveLength(1)
    expect(result.aggregateTextSearchAdapters).toHaveLength(0)
  })

  it('merges plugins from multiple configs', () => {
    const config1: JBrowseConfig = {
      assemblies: [makeAssembly('hg38')],
      plugins: [{ name: 'PluginA', url: 'https://example.com/pluginA.js' }],
    }
    const config2: JBrowseConfig = {
      assemblies: [makeAssembly('mm10')],
      plugins: [{ name: 'PluginB', url: 'https://example.com/pluginB.js' }],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.plugins).toHaveLength(2)
    expect(result.plugins?.map(p => p.name)).toEqual(['PluginA', 'PluginB'])
  })

  it('deduplicates plugins by name', () => {
    const config1: JBrowseConfig = {
      assemblies: [makeAssembly('hg38')],
      plugins: [{ name: 'PluginA', url: 'https://example.com/pluginA-v1.js' }],
    }
    const config2: JBrowseConfig = {
      assemblies: [makeAssembly('mm10')],
      plugins: [{ name: 'PluginA', url: 'https://example.com/pluginA-v2.js' }],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.plugins).toHaveLength(1)
    expect(result.plugins?.[0]?.url).toBe('https://example.com/pluginA-v1.js')
  })

  it('omits plugins key when no plugins present', () => {
    const config1: JBrowseConfig = { assemblies: [makeAssembly('hg38')] }
    const config2: JBrowseConfig = { assemblies: [makeAssembly('mm10')] }

    const result = mergeConfigs([config1, config2])

    expect(result.plugins).toBeUndefined()
  })

  describe('synteny tracks', () => {
    it('adds synteny tracks when includeSyntenyTracks is true', () => {
      const config1: JBrowseConfig = { assemblies: [makeAssembly('hg38')] }
      const config2: JBrowseConfig = { assemblies: [makeAssembly('mm10')] }

      const syntenyTrack: SyntenyTrack = {
        trackId: 'synteny-hg38-mm10',
        name: 'Human vs Mouse',
        assemblyNames: ['hg38', 'mm10'],
        adapter: {
          type: 'PAFAdapter',
          targetAssembly: 'hg38',
          queryAssembly: 'mm10',
        },
      }

      const result = mergeConfigs([config1, config2], {
        includeSyntenyTracks: true,
        syntenyTracks: [syntenyTrack],
      })

      expect(result.tracks).toHaveLength(1)
      expect(result.tracks?.[0]?.type).toBe('SyntenyTrack')
      expect(result.tracks?.[0]?.trackId).toBe('synteny-hg38-mm10')
    })

    it('filters out synteny tracks where assemblies are not present', () => {
      const config: JBrowseConfig = { assemblies: [makeAssembly('hg38')] }

      const syntenyTrack: SyntenyTrack = {
        trackId: 'synteny-hg38-mm10',
        name: 'Human vs Mouse',
        assemblyNames: ['hg38', 'mm10'],
        adapter: {
          type: 'PAFAdapter',
          targetAssembly: 'hg38',
          queryAssembly: 'mm10',
        },
      }

      const result = mergeConfigs([config], {
        includeSyntenyTracks: true,
        syntenyTracks: [syntenyTrack],
      })

      expect(result.tracks).toHaveLength(0)
    })

    it('filters out synteny tracks with more than 2 assemblies', () => {
      const config1: JBrowseConfig = { assemblies: [makeAssembly('hg38')] }
      const config2: JBrowseConfig = { assemblies: [makeAssembly('mm10')] }
      const config3: JBrowseConfig = { assemblies: [makeAssembly('rn6')] }

      const syntenyTrack: SyntenyTrack = {
        trackId: 'synteny-multi',
        name: 'Multi assembly',
        assemblyNames: ['hg38', 'mm10', 'rn6'],
        adapter: {
          type: 'PAFAdapter',
          targetAssembly: 'hg38',
          queryAssembly: 'mm10',
        },
      }

      const result = mergeConfigs([config1, config2, config3], {
        includeSyntenyTracks: true,
        syntenyTracks: [syntenyTrack],
      })

      expect(result.tracks).toHaveLength(0)
    })
  })

  describe('default session', () => {
    it('creates linear default session when createDefaultSession is true', () => {
      const config: JBrowseConfig = {
        assemblies: [makeAssembly('hg38', 'Human')],
      }

      const result = mergeConfigs([config], {
        createDefaultSession: true,
        sessionType: 'linear',
      })

      expect(result.defaultSession).toBeDefined()
      const session = result.defaultSession as {
        name: string
        views: { type: string }[]
      }
      expect(session.name).toBe('hg38')
      expect(session.views[0]?.type).toBe('LinearGenomeView')
    })

    it('creates synteny default session when sessionType is synteny', () => {
      const config1: JBrowseConfig = { assemblies: [makeAssembly('hg38')] }
      const config2: JBrowseConfig = { assemblies: [makeAssembly('mm10')] }

      const result = mergeConfigs([config1, config2], {
        createDefaultSession: true,
        sessionType: 'synteny',
      })

      const session = result.defaultSession as unknown as {
        name: string
        views: { type: string; views: { type: string }[] }[]
      }
      expect(session.name).toBe('Synteny - hg38 vs mm10')
      expect(session.views[0]?.type).toBe('LinearSyntenyView')
      expect(session.views[0]?.views).toHaveLength(2)
    })

    it('falls back to linear session when only one assembly for synteny', () => {
      const config: JBrowseConfig = { assemblies: [makeAssembly('hg38')] }

      const result = mergeConfigs([config], {
        createDefaultSession: true,
        sessionType: 'synteny',
      })

      const session = result.defaultSession as {
        views: { type: string }[]
      }
      expect(session.views[0]?.type).toBe('LinearGenomeView')
    })

    it('uses defaultPos from assembly metadata for displayed regions', () => {
      const assembly = makeAssembly('hg38')
      assembly.sequence.metadata = { ucsc: { defaultPos: 'chr1:1000-2000' } }

      const config: JBrowseConfig = { assemblies: [assembly] }

      const result = mergeConfigs([config], {
        createDefaultSession: true,
        sessionType: 'linear',
      })

      const session = result.defaultSession as unknown as {
        views: {
          displayedRegions: {
            assemblyName: string
            refName: string
            start: number
            end: number
          }[]
        }[]
      }
      expect(session.views[0]?.displayedRegions).toEqual([
        { assemblyName: 'hg38', refName: 'chr1', start: 1000, end: 2000 },
      ])
    })

    it('handles defaultPos without range', () => {
      const assembly = makeAssembly('hg38')
      assembly.sequence.metadata = { ucsc: { defaultPos: 'chr1' } }

      const config: JBrowseConfig = { assemblies: [assembly] }

      const result = mergeConfigs([config], {
        createDefaultSession: true,
        sessionType: 'linear',
      })

      const session = result.defaultSession as unknown as {
        views: {
          displayedRegions: {
            start: number
            end: number
          }[]
        }[]
      }
      expect(session.views[0]?.displayedRegions[0]?.start).toBe(0)
      expect(session.views[0]?.displayedRegions[0]?.end).toBe(10000)
    })

    it('does not create default session when createDefaultSession is false', () => {
      const config1: JBrowseConfig = { assemblies: [makeAssembly('hg38')] }
      const config2: JBrowseConfig = { assemblies: [makeAssembly('mm10')] }

      const result = mergeConfigs([config1, config2])

      expect(result.defaultSession).toBeUndefined()
    })
  })
})

describe('idToConfigUrl', () => {
  it('converts GCF accession to genark URL', () => {
    expect(idToConfigUrl('GCF_000298275.1')).toBe(
      'https://jbrowse.org/hubs/genark/GCF/000/298/275/GCF_000298275.1/config.json',
    )
  })

  it('converts GCA accession to genark URL', () => {
    expect(idToConfigUrl('GCA_000001405.29')).toBe(
      'https://jbrowse.org/hubs/genark/GCA/000/001/405/GCA_000001405.29/config.json',
    )
  })

  it('converts UCSC ID to ucsc URL', () => {
    expect(idToConfigUrl('hg38')).toBe(
      'https://jbrowse.org/ucsc/hg38/config.json',
    )
  })

  it('converts other UCSC IDs to ucsc URL', () => {
    expect(idToConfigUrl('mm10')).toBe(
      'https://jbrowse.org/ucsc/mm10/config.json',
    )
  })
})

describe('addRelativeUris', () => {
  it('adds baseUri to objects with uri property', () => {
    const config = {
      adapter: {
        type: 'IndexedFastaAdapter',
        uri: 'genome.fa',
      },
    }
    addRelativeUris(config, 'https://example.com/data/')
    expect(config.adapter.baseUri).toBe('https://example.com/data/')
  })

  it('adds baseUri to nested objects', () => {
    const config = {
      sequence: {
        adapter: {
          fastaLocation: { uri: 'genome.fa' },
          faiLocation: { uri: 'genome.fa.fai' },
        },
      },
    }
    addRelativeUris(config, 'https://example.com/data/')
    expect(
      (config.sequence.adapter.fastaLocation as { baseUri: string }).baseUri,
    ).toBe('https://example.com/data/')
    expect(
      (config.sequence.adapter.faiLocation as { baseUri: string }).baseUri,
    ).toBe('https://example.com/data/')
  })

  it('does not overwrite existing baseUri', () => {
    const config = {
      adapter: {
        uri: 'genome.fa',
        baseUri: 'https://other.com/',
      },
    }
    addRelativeUris(config, 'https://example.com/data/')
    expect(config.adapter.baseUri).toBe('https://other.com/')
  })

  it('handles null and undefined values', () => {
    const config = {
      foo: null,
      bar: undefined,
      adapter: { uri: 'test.fa' },
    }
    addRelativeUris(config, 'https://example.com/')
    expect((config.adapter as { baseUri: string }).baseUri).toBe(
      'https://example.com/',
    )
  })
})
