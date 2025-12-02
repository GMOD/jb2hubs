import { describe, it, expect } from 'vitest'
import { mergeConfigs } from './merger'

describe('mergeConfigs', () => {
  it('throws when no configs provided', () => {
    expect(() => mergeConfigs([])).toThrow('At least one config is required')
  })

  it('returns single config unchanged when no synteny tracks requested', () => {
    const config = {
      assemblies: [{ name: 'hg38' }],
      tracks: [{ trackId: 'genes' }],
    }
    const result = mergeConfigs([config])
    expect(result).toBe(config)
  })

  it('merges assemblies from multiple configs', () => {
    const config1 = { assemblies: [{ name: 'hg38' }] }
    const config2 = { assemblies: [{ name: 'mm10' }] }

    const result = mergeConfigs([config1, config2])

    expect(result.assemblies).toHaveLength(2)
    expect(result.assemblies?.map(a => a.name)).toEqual(['hg38', 'mm10'])
  })

  it('deduplicates assemblies by name', () => {
    const config1 = { assemblies: [{ name: 'hg38', displayName: 'Human' }] }
    const config2 = { assemblies: [{ name: 'hg38', displayName: 'Human v2' }] }

    const result = mergeConfigs([config1, config2])

    expect(result.assemblies).toHaveLength(1)
    expect(result.assemblies?.[0]?.displayName).toBe('Human')
  })

  it('merges tracks from multiple configs', () => {
    const config1 = { tracks: [{ trackId: 'genes' }] }
    const config2 = { tracks: [{ trackId: 'variants' }] }

    const result = mergeConfigs([config1, config2])

    expect(result.tracks).toHaveLength(2)
    expect(result.tracks?.map(t => t.trackId)).toEqual(['genes', 'variants'])
  })

  it('deduplicates tracks by trackId', () => {
    const config1 = { tracks: [{ trackId: 'genes', name: 'Genes v1' }] }
    const config2 = { tracks: [{ trackId: 'genes', name: 'Genes v2' }] }

    const result = mergeConfigs([config1, config2])

    expect(result.tracks).toHaveLength(1)
    expect(result.tracks?.[0]?.name).toBe('Genes v1')
  })

  it('merges aggregateTextSearchAdapters', () => {
    const config1 = {
      aggregateTextSearchAdapters: [{ textSearchAdapterId: 'search1' }],
    }
    const config2 = {
      aggregateTextSearchAdapters: [{ textSearchAdapterId: 'search2' }],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.aggregateTextSearchAdapters).toHaveLength(2)
  })

  it('deduplicates text search adapters', () => {
    const config1 = {
      aggregateTextSearchAdapters: [{ textSearchAdapterId: 'search1' }],
    }
    const config2 = {
      aggregateTextSearchAdapters: [{ textSearchAdapterId: 'search1' }],
    }

    const result = mergeConfigs([config1, config2])

    expect(result.aggregateTextSearchAdapters).toHaveLength(1)
  })

  it('handles configs with missing optional fields', () => {
    const config1 = { assemblies: [{ name: 'hg38' }] }
    const config2 = { tracks: [{ trackId: 'genes' }] }

    const result = mergeConfigs([config1, config2])

    expect(result.assemblies).toHaveLength(1)
    expect(result.tracks).toHaveLength(1)
    expect(result.aggregateTextSearchAdapters).toHaveLength(0)
  })

  describe('synteny tracks', () => {
    it('adds synteny tracks when includeSyntenyTracks is true', () => {
      const config1 = { assemblies: [{ name: 'hg38' }] }
      const config2 = { assemblies: [{ name: 'mm10' }] }

      const result = mergeConfigs([config1, config2], {
        includeSyntenyTracks: true,
        syntenyTracks: [
          {
            trackId: 'synteny-hg38-mm10',
            name: 'Human vs Mouse',
            assemblyNames: ['hg38', 'mm10'],
            adapter: { type: 'PAFAdapter' },
          },
        ],
      })

      expect(result.tracks).toHaveLength(1)
      expect(result.tracks?.[0]?.type).toBe('SyntenyTrack')
      expect(result.tracks?.[0]?.trackId).toBe('synteny-hg38-mm10')
    })

    it('filters out synteny tracks where assemblies are not present', () => {
      const config = { assemblies: [{ name: 'hg38' }] }

      const result = mergeConfigs([config], {
        includeSyntenyTracks: true,
        syntenyTracks: [
          {
            trackId: 'synteny-hg38-mm10',
            name: 'Human vs Mouse',
            assemblyNames: ['hg38', 'mm10'],
            adapter: { type: 'PAFAdapter' },
          },
        ],
      })

      expect(result.tracks).toHaveLength(0)
    })

    it('filters out synteny tracks with more than 2 assemblies', () => {
      const config1 = { assemblies: [{ name: 'hg38' }] }
      const config2 = { assemblies: [{ name: 'mm10' }] }
      const config3 = { assemblies: [{ name: 'rn6' }] }

      const result = mergeConfigs([config1, config2, config3], {
        includeSyntenyTracks: true,
        syntenyTracks: [
          {
            trackId: 'synteny-multi',
            name: 'Multi assembly',
            assemblyNames: ['hg38', 'mm10', 'rn6'],
            adapter: { type: 'PAFAdapter' },
          },
        ],
      })

      expect(result.tracks).toHaveLength(0)
    })

    it('includes metadata in synteny tracks when present', () => {
      const config1 = { assemblies: [{ name: 'hg38' }] }
      const config2 = { assemblies: [{ name: 'mm10' }] }

      const result = mergeConfigs([config1, config2], {
        includeSyntenyTracks: true,
        syntenyTracks: [
          {
            trackId: 'synteny-hg38-mm10',
            name: 'Human vs Mouse',
            assemblyNames: ['hg38', 'mm10'],
            adapter: { type: 'PAFAdapter' },
            metadata: { source: 'UCSC' },
          },
        ],
      })

      expect(result.tracks?.[0]?.metadata).toEqual({ source: 'UCSC' })
    })
  })

  describe('default session', () => {
    it('creates linear default session when createDefaultSession is true', () => {
      const config = {
        assemblies: [{ name: 'hg38', displayName: 'Human' }],
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
      const config1 = { assemblies: [{ name: 'hg38' }] }
      const config2 = { assemblies: [{ name: 'mm10' }] }

      const result = mergeConfigs([config1, config2], {
        createDefaultSession: true,
        sessionType: 'synteny',
      })

      const session = result.defaultSession as {
        name: string
        views: { type: string; views: { type: string }[] }[]
      }
      expect(session.name).toBe('Synteny - hg38 vs mm10')
      expect(session.views[0]?.type).toBe('LinearSyntenyView')
      expect(session.views[0]?.views).toHaveLength(2)
    })

    it('falls back to linear session when only one assembly for synteny', () => {
      const config = { assemblies: [{ name: 'hg38' }] }

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
      const config = {
        assemblies: [
          {
            name: 'hg38',
            sequence: {
              metadata: {
                ucsc: { defaultPos: 'chr1:1000-2000' },
              },
            },
          },
        ],
      }

      const result = mergeConfigs([config], {
        createDefaultSession: true,
        sessionType: 'linear',
      })

      const session = result.defaultSession as {
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
      const config = {
        assemblies: [
          {
            name: 'hg38',
            sequence: {
              metadata: {
                ucsc: { defaultPos: 'chr1' },
              },
            },
          },
        ],
      }

      const result = mergeConfigs([config], {
        createDefaultSession: true,
        sessionType: 'linear',
      })

      const session = result.defaultSession as {
        views: {
          displayedRegions: {
            start: number
            end: number
          }[]
        }[]
      }
      expect(session.views[0]?.displayedRegions?.[0]?.start).toBe(0)
      expect(session.views[0]?.displayedRegions?.[0]?.end).toBe(10000)
    })

    it('does not create default session when createDefaultSession is false', () => {
      const config = { assemblies: [{ name: 'hg38' }] }

      const result = mergeConfigs([config, { assemblies: [{ name: 'mm10' }] }])

      expect(result.defaultSession).toBeUndefined()
    })
  })
})
