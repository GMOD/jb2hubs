import { describe, it, expect, beforeEach } from 'vitest'
import { ConfigMerger } from './merger'
import { JBrowseConfig, SyntenyTrack } from './types'

describe('ConfigMerger', () => {
  let merger: ConfigMerger

  beforeEach(() => {
    merger = new ConfigMerger()
  })

  describe('mergeConfigs', () => {
    it('should throw error when no configs provided', () => {
      expect(() => merger.mergeConfigs([])).toThrow('At least one config is required')
    })

    it('should return single config unchanged when no options', () => {
      const config: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly1',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track1',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly1.2bit',
              },
            },
          },
        ],
        tracks: [],
      }

      const result = merger.mergeConfigs([config])
      expect(result).toEqual(config)
    })

    it('should merge multiple configs with different assemblies', () => {
      const config1: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly1',
            displayName: 'Assembly 1',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track1',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly1.2bit',
              },
            },
          },
        ],
        tracks: [
          {
            trackId: 'track1',
            name: 'Track 1',
            type: 'FeatureTrack',
            assemblyNames: ['assembly1'],
          },
        ],
      }

      const config2: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly2',
            displayName: 'Assembly 2',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track2',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly2.2bit',
              },
            },
          },
        ],
        tracks: [
          {
            trackId: 'track2',
            name: 'Track 2',
            type: 'FeatureTrack',
            assemblyNames: ['assembly2'],
          },
        ],
      }

      const result = merger.mergeConfigs([config1, config2])

      expect(result.assemblies).toHaveLength(2)
      expect(result.assemblies?.map(a => a.name)).toEqual(['assembly1', 'assembly2'])
      expect(result.tracks).toHaveLength(2)
      expect(result.tracks?.map(t => t.trackId)).toEqual(['track1', 'track2'])
    })

    it('should deduplicate assemblies with same name', () => {
      const config1: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly1',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track1',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly1.2bit',
              },
            },
          },
        ],
        tracks: [],
      }

      const config2: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly1',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track1-dup',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly1-dup.2bit',
              },
            },
          },
        ],
        tracks: [],
      }

      const result = merger.mergeConfigs([config1, config2])
      expect(result.assemblies).toHaveLength(1)
      expect(result.assemblies?.[0]?.name).toBe('assembly1')
    })

    it('should include synteny tracks when option enabled', () => {
      const config1: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly1',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track1',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly1.2bit',
              },
            },
          },
        ],
        tracks: [],
      }

      const config2: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly2',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track2',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly2.2bit',
              },
            },
          },
        ],
        tracks: [],
      }

      const syntenyTracks: SyntenyTrack[] = [
        {
          trackId: 'synteny1',
          name: 'Synteny 1-2',
          assemblyNames: ['assembly1', 'assembly2'],
          adapter: {
            type: 'PairwiseIndexedPAFAdapter',
            targetAssembly: 'assembly1',
            queryAssembly: 'assembly2',
            pifGzLocation: { uri: 'https://example.com/synteny.pif.gz' },
          },
        },
      ]

      const result = merger.mergeConfigs([config1, config2], {
        includeSyntenyTracks: true,
        syntenyTracks,
      })

      expect(result.tracks).toHaveLength(1)
      expect(result.tracks?.[0]?.type).toBe('SyntenyTrack')
      expect(result.tracks?.[0]?.trackId).toBe('synteny1')
    })

    it('should filter synteny tracks to only include relevant assemblies', () => {
      const config1: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly1',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track1',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly1.2bit',
              },
            },
          },
        ],
        tracks: [],
      }

      const syntenyTracks: SyntenyTrack[] = [
        {
          trackId: 'synteny1',
          name: 'Synteny 1-2',
          assemblyNames: ['assembly1', 'assembly2'],
          adapter: {
            type: 'PairwiseIndexedPAFAdapter',
            targetAssembly: 'assembly1',
            queryAssembly: 'assembly2',
          },
        },
        {
          trackId: 'synteny3',
          name: 'Synteny 3-4',
          assemblyNames: ['assembly3', 'assembly4'],
          adapter: {
            type: 'PairwiseIndexedPAFAdapter',
            targetAssembly: 'assembly3',
            queryAssembly: 'assembly4',
          },
        },
      ]

      const result = merger.mergeConfigs([config1], {
        includeSyntenyTracks: true,
        syntenyTracks,
      })

      expect(result.tracks).toHaveLength(0)
    })

    it('should merge aggregateTextSearchAdapters', () => {
      const config1: JBrowseConfig = {
        assemblies: [],
        tracks: [],
        aggregateTextSearchAdapters: [
          {
            type: 'TrixTextSearchAdapter',
            textSearchAdapterId: 'adapter1',
            assemblyNames: ['assembly1'],
            ixFilePath: { uri: 'https://example.com/index.ix' },
          },
        ],
      }

      const config2: JBrowseConfig = {
        assemblies: [],
        tracks: [],
        aggregateTextSearchAdapters: [
          {
            type: 'TrixTextSearchAdapter',
            textSearchAdapterId: 'adapter2',
            assemblyNames: ['assembly2'],
            ixFilePath: { uri: 'https://example.com/index2.ix' },
          },
        ],
      }

      const result = merger.mergeConfigs([config1, config2])
      expect(result.aggregateTextSearchAdapters).toHaveLength(2)
    })

    it('should create linear default session when requested', () => {
      const config: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly1',
            displayName: 'Assembly 1',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track1',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly1.2bit',
              },
              metadata: {
                ucsc: {
                  defaultPos: 'chr1:1000-2000',
                },
              },
            },
          },
        ],
        tracks: [],
      }

      const result = merger.mergeConfigs([config], {
        createDefaultSession: true,
        sessionType: 'linear',
      })

      expect(result.defaultSession).toBeDefined()
      expect(result.defaultSession?.views).toHaveLength(1)
      expect(result.defaultSession?.views?.[0]?.type).toBe('LinearGenomeView')
    })

    it('should create synteny default session when requested', () => {
      const config1: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly1',
            displayName: 'Assembly 1',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track1',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly1.2bit',
              },
            },
          },
        ],
        tracks: [],
      }

      const config2: JBrowseConfig = {
        assemblies: [
          {
            name: 'assembly2',
            displayName: 'Assembly 2',
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: 'track2',
              adapter: {
                type: 'TwoBitAdapter',
                uri: 'https://example.com/assembly2.2bit',
              },
            },
          },
        ],
        tracks: [],
      }

      const result = merger.mergeConfigs([config1, config2], {
        createDefaultSession: true,
        sessionType: 'synteny',
      })

      expect(result.defaultSession).toBeDefined()
      expect(result.defaultSession?.views).toHaveLength(1)
      expect(result.defaultSession?.views?.[0]?.type).toBe('LinearSyntenyView')
    })
  })
})
