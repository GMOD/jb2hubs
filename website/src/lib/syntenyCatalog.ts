// The synteny catalog is the set of assemblies and synteny tracks that the
// /synteny page lets you browse, backed by the build-time `syntenyTracks.json`
// that `scripts/extractSyntenyTracks.ts` writes and the page hands to the
// selector as island props. That file is already the pruned shape below — track
// ids, names and assembly names, plus info for the assemblies that take part —
// not the configs' adapters, which nothing on the client reads and which made
// the props 8 MB. The queries are synchronous because the data is: an earlier
// Promise-returning version bought nothing but forced the selector to mirror
// every list into state behind an effect.

export type AssemblySource = 'ucsc' | 'genark' | 'legacy'

export interface AssemblyInfo {
  commonName?: string
  scientificName?: string
  source: AssemblySource
  // NCBI taxonomy id, which is what the gene picker searches and resolves
  // orthologs by.
  taxonId?: number
  // The NCBI accession a UCSC db stands for, from the genome list's
  // sourceName. A GenArk name is its own accession and carries none.
  accession?: string
  // The gene track a launched panel opens for this genome; '' when its config
  // has none. A LinearSyntenyView sub-view gets no defaultSession, so a panel
  // launched without one is an empty browser at the right locus.
  geneTrack: string
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
  source: AssemblySource
}

// Which assembly sources are currently enabled in the UI.
export interface SourceFilter {
  ucsc: boolean
  genark: boolean
}

export const ALL_SOURCES: SourceFilter = { ucsc: true, genark: true }

export interface SyntenyCatalog {
  // Assemblies that participate in at least one launchable track.
  listAssemblies(filter: SourceFilter): SyntenyAssembly[]
  // Assemblies that have a synteny track in common with `assemblyId`.
  listPartners(assemblyId: string, filter: SourceFilter): SyntenyAssembly[]
  // Synteny tracks linking the two given assemblies.
  listTracks(
    assembly1: string,
    assembly2: string,
    filter: SourceFilter,
  ): SyntenyTrackSummary[]
  // Distinct assembly pairs with a launchable track, counting both liftOver
  // directions and the chainBridge variant of one comparison once.
  countComparisons(filter: SourceFilter): number
}

export interface SyntenyCatalogData {
  tracks: SyntenyTrackSummary[]
  assemblyInfo: Record<string, AssemblyInfo>
}

// A pair of assemblies usually exposes the same comparison in both liftOver
// directions (the trackId always begins with the target assembly), plus the
// occasional `_chainBridge` algorithm variant. The launcher reads
// species1 -> species2, so default to the track whose target is species1 and
// prefer the plain liftOver, letting the user swap or open Options to change it.
export function pickDefaultTrack(
  tracks: SyntenyTrackSummary[],
  species1: string,
) {
  const forward = tracks.filter(t => t.trackId.startsWith(`${species1}_to_`))
  const candidates = forward.length > 0 ? forward : tracks
  const plain = candidates.find(t => !t.trackId.includes('chainBridge'))
  return plain ?? candidates[0]
}

// Both ends of the track name a hosted, non-retired assembly whose source the
// filter allows. Shared with generateSyntenyAccessions.ts so the accession
// pages link to exactly the assemblies the selector lists.
export function trackIsLaunchable(
  track: SyntenyTrackSummary,
  assemblyInfo: Record<string, AssemblyInfo>,
  filter: SourceFilter = ALL_SOURCES,
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

// GCA_000001215.4 and GCF_000001215.4 are one assembly (the GenBank and RefSeq
// copies), so identity is the digits and version without the prefix. The
// version is kept on purpose: hg19 and hg38 share GCA_000001405 and are a real
// comparison, which is why this is stricter than the version-stripped rule
// generateSyntenyPairIndex.ts needs for its base-keyed lookups.
function assemblyIdentity(
  name: string,
  assemblyInfo: Record<string, AssemblyInfo>,
) {
  const accession = assemblyInfo[name]?.accession ?? name
  return /^GC[AF]_(\d+\.\d+)/.exec(accession)?.[1] ?? accession
}

// A track whose two halves are the same genome under two names — UCSC dm6
// against the GenArk build of the same assembly — which would otherwise offer
// an assembly as its own partner.
export function isSelfPair(
  track: SyntenyTrackSummary,
  assemblyInfo: Record<string, AssemblyInfo>,
) {
  const [a, b] = track.assemblyNames
  return (
    a !== undefined &&
    b !== undefined &&
    assemblyIdentity(a, assemblyInfo) === assemblyIdentity(b, assemblyInfo)
  )
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
      result = tracks.filter(
        track =>
          trackIsLaunchable(track, assemblyInfo, filter) &&
          !isSelfPair(track, assemblyInfo),
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
    listAssemblies(filter) {
      const ids = new Set<string>()
      for (const track of launchableTracks(filter)) {
        for (const name of track.assemblyNames) {
          ids.add(name)
        }
      }
      return sortedAssemblies(ids)
    },

    listPartners(assemblyId, filter) {
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

    listTracks(assembly1, assembly2, filter) {
      return launchableTracks(filter).filter(
        track =>
          track.assemblyNames.includes(assembly1) &&
          track.assemblyNames.includes(assembly2),
      )
    },

    countComparisons(filter) {
      const pairs = new Set<string>()
      for (const track of launchableTracks(filter)) {
        pairs.add(track.assemblyNames.slice().sort().join('\t'))
      }
      return pairs.size
    },
  }
}
