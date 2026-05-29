// The synteny catalog is the set of assemblies and synteny tracks that the
// /synteny page lets you browse. Today it is backed by the build-time
// `syntenyTracks.json` blob, but the UI only ever talks to the SyntenyCatalog
// interface below. Swapping the static backing for an API/DB-backed catalog
// (e.g. createApiCatalog(endpoint)) is then a one-line change in the component
// and requires no changes to the selector logic.

export interface AssemblyInfo {
  commonName?: string
  scientificName?: string
  source: string
}

export interface SyntenyTrackSummary {
  trackId: string
  name: string
  assemblyNames: string[]
}

export interface SyntenyAssembly {
  id: string
  displayName: string
  scientificName: string
  source: string
}

// Which assembly sources are currently enabled in the UI. A future DB-backed
// catalog would translate this into query predicates.
export interface SourceFilter {
  ucsc: boolean
  genark: boolean
}

export interface SyntenyCatalog {
  // Assemblies that participate in at least one launchable track.
  listAssemblies(filter: SourceFilter): Promise<SyntenyAssembly[]>
  // Assemblies that have a synteny track in common with `assemblyId`.
  listPartners(
    assemblyId: string,
    filter: SourceFilter,
  ): Promise<SyntenyAssembly[]>
  // Synteny tracks linking the two given assemblies.
  listTracks(
    assembly1: string,
    assembly2: string,
    filter: SourceFilter,
  ): Promise<SyntenyTrackSummary[]>
}

export interface SyntenyCatalogData {
  tracks: SyntenyTrackSummary[]
  assemblyInfo: Record<string, AssemblyInfo>
}

function trackIsLaunchable(
  track: SyntenyTrackSummary,
  assemblyInfo: Record<string, AssemblyInfo>,
  filter: SourceFilter,
) {
  let launchable = true
  for (const name of track.assemblyNames) {
    const info = assemblyInfo[name]
    if (!info || info.source === 'legacy') {
      launchable = false
    } else if (info.source === 'ucsc' && !filter.ucsc) {
      launchable = false
    } else if (info.source === 'genark' && !filter.genark) {
      launchable = false
    }
  }
  return launchable
}

export function createStaticCatalog(data: SyntenyCatalogData): SyntenyCatalog {
  const { tracks, assemblyInfo } = data

  // Launchable-track lists are recomputed only when a source filter combination
  // is first seen, then cached (there are only four possible combinations).
  const launchableCache = new Map<string, SyntenyTrackSummary[]>()
  function launchableTracks(filter: SourceFilter) {
    const key = `${filter.ucsc ? 1 : 0}${filter.genark ? 1 : 0}`
    let result = launchableCache.get(key)
    if (!result) {
      result = tracks.filter(track =>
        trackIsLaunchable(track, assemblyInfo, filter),
      )
      launchableCache.set(key, result)
    }
    return result
  }

  function toAssembly(id: string): SyntenyAssembly {
    const info = assemblyInfo[id]
    return {
      id,
      displayName: info?.commonName ?? id,
      scientificName: info?.scientificName ?? '',
      source: info?.source ?? 'legacy',
    }
  }

  function sortedAssemblies(ids: Iterable<string>) {
    return Array.from(ids)
      .map(toAssembly)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  return {
    async listAssemblies(filter) {
      const ids = new Set<string>()
      for (const track of launchableTracks(filter)) {
        for (const name of track.assemblyNames) {
          ids.add(name)
        }
      }
      return sortedAssemblies(ids)
    },

    async listPartners(assemblyId, filter) {
      const ids = new Set<string>()
      for (const track of launchableTracks(filter)) {
        if (
          track.assemblyNames.length === 2 &&
          track.assemblyNames.includes(assemblyId)
        ) {
          for (const name of track.assemblyNames) {
            if (name !== assemblyId) {
              ids.add(name)
            }
          }
        }
      }
      return sortedAssemblies(ids)
    },

    async listTracks(assembly1, assembly2, filter) {
      return launchableTracks(filter).filter(
        track =>
          track.assemblyNames.includes(assembly1) &&
          track.assemblyNames.includes(assembly2),
      )
    },
  }
}
