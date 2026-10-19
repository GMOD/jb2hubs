// The synteny catalog is the set of assemblies and synteny tracks that the
// /synteny page lets you browse, backed by the build-time `syntenyTracks.json`
// that `scripts/extractSyntenyTracks.ts` writes and the selector fetches as a
// static asset. That file is already the pruned shape below — track ids, names
// and assembly names, plus info for the assemblies that take part — not the
// configs' adapters, which nothing on the client reads and which made it 8 MB.
// The queries are synchronous because the data is, once loaded: an earlier
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

export interface SyntenyCatalog {
  // Assemblies that participate in at least one launchable track.
  listAssemblies(): SyntenyAssembly[]
  // Assemblies that have a synteny track in common with `assemblyId`.
  listPartners(assemblyId: string): SyntenyAssembly[]
  // Synteny tracks linking the two given assemblies.
  listTracks(assembly1: string, assembly2: string): SyntenyTrackSummary[]
  // Distinct assembly pairs with a launchable track, counting both liftOver
  // directions and the chainBridge variant of one comparison once.
  countComparisons(): number
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

// The second assembly of a pair: the requested one when it is a partner, else
// the only partner there is (over half the listed assemblies have exactly one),
// else none.
export function chooseSecondAssembly(
  partners: SyntenyAssembly[],
  requested: string,
) {
  if (partners.some(a => a.id === requested)) {
    return requested
  }
  return partners.length === 1 ? partners[0]!.id : ''
}

// Both ends of the track name a hosted, non-retired assembly. Shared with generateSyntenyAccessions.ts so the accession
// pages link to exactly the assemblies the selector lists.
export function trackIsLaunchable(
  track: SyntenyTrackSummary,
  assemblyInfo: Record<string, AssemblyInfo>,
) {
  return track.assemblyNames.every(name => {
    const source = assemblyInfo[name]?.source
    return source !== undefined && source !== 'legacy'
  })
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

// A UCSC db names its build in its trailing number (mm39, panTro6); a GenArk
// accession names none, so it has no build number here.
function ucscBuild(asm: SyntenyAssembly) {
  const match = asm.source === 'ucsc' ? /\d+$/.exec(asm.id) : null
  return match ? Number(match[0]) : undefined
}

// Alphabetical by organism, and within one the UCSC builds newest first, ahead
// of the GenArk assemblies, which keep the order they came in. A picker breaks
// equally good matches by list order, so this is what makes "mouse" offer mm39
// before mm7.
export function byOrganismNewestFirst(a: SyntenyAssembly, b: SyntenyAssembly) {
  const buildA = ucscBuild(a)
  const buildB = ucscBuild(b)
  return (
    a.displayName.localeCompare(b.displayName) ||
    (buildB ?? -1) - (buildA ?? -1)
  )
}

export function createStaticCatalog(data: SyntenyCatalogData): SyntenyCatalog {
  const { tracks, assemblyInfo } = data

  const launchable = tracks.filter(
    track =>
      trackIsLaunchable(track, assemblyInfo) &&
      !isSelfPair(track, assemblyInfo),
  )

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
    return Array.from(ids).map(toAssembly).sort(byOrganismNewestFirst)
  }

  return {
    listAssemblies() {
      const ids = new Set<string>()
      for (const track of launchable) {
        for (const name of track.assemblyNames) {
          ids.add(name)
        }
      }
      return sortedAssemblies(ids)
    },

    listPartners(assemblyId) {
      const ids = new Set<string>()
      for (const track of launchable) {
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

    listTracks(assembly1, assembly2) {
      return launchable.filter(
        track =>
          track.assemblyNames.includes(assembly1) &&
          track.assemblyNames.includes(assembly2),
      )
    },

    countComparisons() {
      const pairs = new Set<string>()
      for (const track of launchable) {
        pairs.add(track.assemblyNames.slice().sort().join('\t'))
      }
      return pairs.size
    },
  }
}
