import type { JBrowseConfig, Track } from './types.ts'

// a star of fewer pairs than this says nothing its pairwise tracks do not
export const MIN_MATES = 3
// the most lanes a star opens on; the lane picker offers every other mate
const MAX_DEFAULT_LANES = 9
// MultiWaySyntenyDisplay's MIN_LANE_PITCH: a track this tall per lane never
// scrolls
const LANE_PITCH = 22

interface Mate {
  name: string
  adapter: Record<string, unknown>
}

/** what a star needs to know about a genome: UCSC's genome list, or nothing */
export interface StarGenome {
  organism?: string
  orderKey?: unknown
  [key: string]: unknown
}

export interface MultiwayStarTrack extends Track {
  type: 'SyntenyTrack'
  name: string
  category: string[]
  assemblyNames: string[]
  adapter: {
    type: 'MultiPairwiseSyntenyAdapter'
    adapters: Record<string, unknown>[]
    lanes: { name: string; label?: string; group?: string }[]
  }
  displays: Record<string, unknown>[]
}

/**
 * The mate of a `<anchor>_to_<mate>_liftOver` track, as the chain-track
 * builders name them; the chainBridge variant is a second file for the same
 * pair and would draw its lane twice
 */
export function liftOverMateOf(
  track: { trackId: string; assemblyNames: string[] },
  anchor: string,
) {
  const [first, mate] = track.assemblyNames
  return track.trackId.startsWith(`${anchor}_to_`) &&
    track.trackId.endsWith('_liftOver') &&
    first === anchor &&
    mate !== anchor
    ? mate
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function liftOverMates(config: JBrowseConfig, anchor: string): Mate[] {
  return (config.tracks ?? []).flatMap(track => {
    const { assemblyNames, adapter } = track
    const mate =
      track.type === 'SyntenyTrack' &&
      Array.isArray(assemblyNames) &&
      isRecord(adapter)
        ? liftOverMateOf(
            {
              trackId: track.trackId,
              assemblyNames: assemblyNames as string[],
            },
            anchor,
          )
        : undefined
    return mate === undefined
      ? []
      : [{ name: mate, adapter: adapter as Record<string, unknown> }]
  })
}

const words = (value: unknown) =>
  typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : []

/**
 * The trackDb settings of whichever of the anchor's multiple alignments names
 * the most of these mates among its default species. UCSC curates a
 * `speciesDefaultOn` list and `sGroup_*` clades on every multiz track, in the
 * genome's trackDb whether or not the alignment itself was converted
 */
function speciesSettings(
  alignments: Record<string, unknown>[],
  mates: Set<string>,
) {
  const named = (settings: Record<string, unknown>) =>
    words(settings.speciesDefaultOn).filter(db => mates.has(db)).length
  const ucsc =
    alignments
      .filter(settings => named(settings) > 0)
      .sort((a, b) => named(b) - named(a))[0] ?? {}
  const groupOf = new Map<string, string>()
  for (const [key, value] of Object.entries(ucsc)) {
    if (key.startsWith('sGroup_')) {
      const group = key.slice('sGroup_'.length).replaceAll('_', ' ')
      for (const db of words(value)) {
        if (!groupOf.has(db)) {
          groupOf.set(db, group)
        }
      }
    }
  }
  return {
    defaultOn: words(ucsc.speciesDefaultOn),
    groupOf,
    groupOrder: words(ucsc.speciesGroups).map(g => g.replaceAll('_', ' ')),
  }
}

// panTro6 over panTro5: UCSC counts builds in the db name's trailing number
function buildOf(db: string) {
  return Number(/(\d+)$/.exec(db)?.[1] ?? 0)
}

function orderKeyOf(genome: StarGenome | undefined) {
  const key = genome?.orderKey
  return typeof key === 'number' ? key : Number.POSITIVE_INFINITY
}

/**
 * The lanes a star opens on. UCSC curates which genomes its multiple
 * alignment shows by default (`speciesDefaultOn`), and where the anchor has
 * one that is the comparison it means. Without one, the newest assembly of
 * each other organism, in UCSC's own genome-list order.
 */
function defaultLanes(
  mates: Mate[],
  anchor: string,
  genomes: Record<string, StarGenome>,
  defaultOn: string[],
) {
  const names = new Set(mates.map(mate => mate.name))
  const curated = defaultOn.filter(db => names.has(db))
  if (curated.length > 0) {
    return curated.slice(0, MAX_DEFAULT_LANES)
  }
  const anchorOrganism = genomes[anchor]?.organism
  const newest = new Map<string, string>()
  for (const { name } of mates) {
    const organism = genomes[name]?.organism ?? name
    const held = newest.get(organism)
    if (
      organism !== anchorOrganism &&
      (held === undefined || buildOf(name) > buildOf(held))
    ) {
      newest.set(organism, name)
    }
  }
  return [...newest.values()]
    .sort(
      (a, b) =>
        orderKeyOf(genomes[a]) - orderKeyOf(genomes[b]) || a.localeCompare(b),
    )
    .slice(0, MAX_DEFAULT_LANES)
}

/**
 * The trackDb settings of every multiple alignment a config or a trackDb
 * holds for its genome: a converted track's `metadata.ucsc`, and each
 * trackDb entry's parsed settings
 */
export function alignmentSettings(
  config: JBrowseConfig,
  trackDb: Record<string, string>[] = [],
) {
  return [
    ...(config.tracks ?? []).flatMap(track => {
      const { metadata } = track
      return isRecord(metadata) && isRecord(metadata.ucsc)
        ? [metadata.ucsc]
        : []
    }),
    ...trackDb,
  ].filter(settings => typeof settings.speciesDefaultOn === 'string')
}

/**
 * One multi-way synteny track over every liftOver PIF the anchor's config
 * already references: a MultiPairwiseSyntenyAdapter whose children are the
 * pairwise tracks' own adapters, so it hosts nothing new. Its lanes are
 * labelled by organism and grouped by the anchor's multiple-alignment clades,
 * clade by clade, and it opens on `defaultLanes`; the display fetches only the
 * lanes it draws, so the other mates cost nothing until a reader picks them.
 *
 * Staging-only: `MultiWaySyntenyDisplay` is newer than every released host,
 * and a display type a host lacks is fatal once the track is opened.
 */
export function multiwayStarTrack({
  config,
  assemblyName,
  anchor = assemblyName,
  label,
  genomes,
  labelOf,
  geneTrackId,
  alignments = [],
}: {
  config: JBrowseConfig
  /** the UCSC db name or the GenArk accession, which `genomes` is keyed by */
  assemblyName: string
  /** the config's own assembly name, which the tracks name */
  anchor?: string
  /** a reader's name for the anchor, which the track name puts before `assemblyName` */
  label?: string
  genomes: Record<string, StarGenome>
  /** what the pairwise liftOver track calls a mate, '' when nothing */
  labelOf: (mate: string) => string
  geneTrackId: string | undefined
  /** see `alignmentSettings` */
  alignments?: Record<string, unknown>[]
}): MultiwayStarTrack | undefined {
  const mates = liftOverMates(config, anchor)
  if (mates.length < MIN_MATES) {
    return undefined
  }
  const { defaultOn, groupOf, groupOrder } = speciesSettings(
    alignments,
    new Set(mates.map(mate => mate.name)),
  )
  const rank = (mate: Mate) => {
    const group = groupOf.get(mate.name)
    const index = group === undefined ? -1 : groupOrder.indexOf(group)
    return group === undefined
      ? Number.POSITIVE_INFINITY
      : index < 0
        ? groupOrder.length
        : index
  }
  const ordered = [...mates].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      orderKeyOf(genomes[a.name]) - orderKeyOf(genomes[b.name]) ||
      a.name.localeCompare(b.name),
  )
  const lanes = defaultLanes(ordered, assemblyName, genomes, defaultOn)
  return {
    type: 'SyntenyTrack',
    trackId: `${anchor}_liftOver_multiway`,
    name: `${label ? `${label} (${assemblyName})` : assemblyName} vs ${mates.length} genomes (liftOver, multi-way)`,
    category: ['Pairwise alignments'],
    assemblyNames: [anchor, ...lanes],
    adapter: {
      type: 'MultiPairwiseSyntenyAdapter',
      adapters: ordered.map(mate => mate.adapter),
      lanes: ordered.map(mate => {
        const label = labelOf(mate.name)
        const group = groupOf.get(mate.name)
        return {
          name: mate.name,
          ...(label ? { label } : {}),
          ...(group ? { group } : {}),
        }
      }),
    },
    displays: [
      {
        type: 'MultiWaySyntenyDisplay',
        displayId: `${anchor}_liftOver_multiway-MultiWaySyntenyDisplay`,
        height: Math.ceil(((1 + lanes.length) * LANE_PITCH) / 10) * 10,
        ...(geneTrackId ? { laneGeneTracks: [geneTrackId] } : {}),
      },
    ],
  }
}
