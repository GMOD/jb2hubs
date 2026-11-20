import { once } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BigBed } from '@gmod/bbi'
import {
  categoryLabel,
  getUcscWiggleDisplay,
  isArrayOf,
  isNumber,
  isOptional,
  isShape,
  isString,
  subGroupMetadata,
} from 'hubtools'

import { checkIfFileAccessible } from './checkIfFileAccessible.ts'
import { isTrackDb } from './guards.ts'
import { withDescriptionLink } from './trackDbMetadata.ts'
import { UCSC_ROOT, readChecked } from './util.ts'
import {
  parentTrackName,
  parseTrackDbSettings,
  trackDbLineage,
} from './utils/trackDbSettings.ts'

import type { TrackDbEntry, UcscTrack } from './types.ts'
import type { FinalizeStep } from './utils/finalizeStep.ts'
import type { Guard } from 'hubtools'

/**
 * A UCSC composite (or supertrack) whose bigBed descendants of one type become
 * one track, a row per subtrack named by `source`. The subtracks are read from
 * trackDb on every run, so one UCSC adds or drops joins or leaves the track
 * with no edit here. `display` picks the display the track opens on: `rows`
 * (one fixed row per source) or `sections` (each source packed in its own
 * section, keeping labels). `combine` is `file` (the default: one
 * tabix-indexed BED we derive and host) or `adapters` (a MultiWiggleAdapter
 * over the upstream bigBeds, for files too large to copy). A `bigWig` family is
 * always a MultiWiggleAdapter over the upstream files: a MultiQuantitativeTrack
 * with a row per subtrack, or, where the subtracks sit in multiWig containers,
 * a row per container with its subtracks overlaid (`group`). The subtracks a
 * `bigWig` family's track covers leave the config: the set is offered as its
 * rows. `splitBy` names one of the composite's subgroups and makes a track per
 * value of it, for a set with too many subtracks for one track's rows.
 *
 * A faceted composite, one whose `dataTypes` lists the kinds of data each of
 * its samples has (the Fiber-seq Compendium), is offered only as its families'
 * tracks: a `bigWig` family makes one track per data type, a track is named by
 * its data type's label, and the per-sample subtracks a track covers leave the
 * config with their containers. `height` is a `bigWig` family's display height
 * in px, for a track with many rows.
 */
export interface CombinedFamily {
  composite: string
  type: string
  display: 'rows' | 'sections'
  combine?: 'file' | 'adapters'
  height?: number
  splitBy?: string
}

const isDisplayChoice: Guard<CombinedFamily['display']> = (
  v: unknown,
): v is CombinedFamily['display'] => v === 'rows' || v === 'sections'

const isCombineChoice: Guard<NonNullable<CombinedFamily['combine']>> = (
  v: unknown,
): v is NonNullable<CombinedFamily['combine']> =>
  v === 'file' || v === 'adapters'

const isCombinedFamilies: Guard<CombinedFamily[]> = isArrayOf(
  isShape({
    composite: isString,
    type: isString,
    display: isDisplayChoice,
    combine: isOptional(isCombineChoice),
    height: isOptional(isNumber),
    splitBy: isOptional(isString),
  }),
)

const HGDOWNLOAD = 'https://hgdownload.soe.ucsc.edu'

const SIGNAL_TYPE = 'bigWig'

export function derivesFile(family: CombinedFamily) {
  return family.type !== SIGNAL_TYPE && family.combine !== 'adapters'
}

export const COMBINED_DIR = 'combined'

export function readCombinedFamilies(assemblyName: string) {
  const file = path.join(UCSC_ROOT, 'combinedTracks', `${assemblyName}.json`)
  return fs.existsSync(file) ? readChecked(file, isCombinedFamilies) : []
}

export function combinedKey(family: CombinedFamily) {
  return `${family.composite}-${family.type}`
}

export function combinedFile(family: CombinedFamily) {
  return `${COMBINED_DIR}/${combinedKey(family)}.bed.gz`
}

export interface CombinedSource {
  table: string
  label: string
  gbdbPath: string
  settings: Record<string, string>
}

function descendsFrom(
  tracksDb: Record<string, TrackDbEntry>,
  table: string,
  ancestor: string,
  seen = new Set<string>(),
): boolean {
  const entry = tracksDb[table]
  const parent = entry
    ? parentTrackName(parseTrackDbSettings(entry.settings))
    : undefined
  return parent === undefined || seen.has(parent)
    ? false
    : parent === ancestor ||
        descendsFrom(tracksDb, parent, ancestor, seen.add(table))
}

export function withoutSharedPrefix(labels: string[]) {
  const words = labels.map(label => label.split(' '))
  const first = words[0] ?? []
  const shared = (n: number): boolean =>
    labels.length > 1 && words.every(w => w.length > n + 1 && w[n] === first[n])
  let n = 0
  while (shared(n)) {
    n++
  }
  // "CRG Align 36" stays whole: a row named "36" says nothing
  const kept = words.every(w => /\p{L}/u.test(w.slice(n).join(' '))) ? n : 0
  return {
    labels: words.map(w => w.slice(kept).join(' ')),
    prefix: first.slice(0, kept).join(' '),
  }
}

export function withoutSharedSuffix(labels: string[]) {
  const words = labels.map(label => label.split(' '))
  const first = words[0] ?? []
  const shared = (n: number): boolean =>
    labels.length > 1 &&
    words.every(
      w =>
        w.length > n + 1 && w[w.length - 1 - n] === first[first.length - 1 - n],
    )
  let n = 0
  while (shared(n)) {
    n++
  }
  return {
    labels: words.map(w => w.slice(0, w.length - n).join(' ')),
    suffix: first.slice(first.length - n).join(' '),
  }
}

function priorityOf(settings: Record<string, string> | undefined) {
  return Number(settings?.priority ?? Infinity)
}

// Subtracks under different composites of a supertrack stay together, in the
// composites' own order, then each composite's by priority.
function placeOf(
  tracksDb: Record<string, TrackDbEntry>,
  table: string,
  settings: Record<string, string>,
) {
  const parent = parentTrackName(settings) ?? ''
  const parentEntry = tracksDb[parent]
  const parentSettings = parentEntry
    ? parseTrackDbSettings(parentEntry.settings)
    : undefined
  return {
    parentPriority: priorityOf(parentSettings),
    parent,
    priority: priorityOf(settings),
    table,
  }
}

const GBDB = '/gbdb/'

// A subtrack's file under /gbdb/: its `bigDataUrl`, or, for an older composite
// whose subtracks name a table instead, the url the config's track for that
// table reads.
function gbdbPathOf(settings: Record<string, string>, uri?: string) {
  const upstream = `${HGDOWNLOAD}${GBDB}`
  return settings.bigDataUrl?.startsWith(GBDB)
    ? settings.bigDataUrl.slice(GBDB.length)
    : uri?.startsWith(upstream)
      ? uri.slice(upstream.length)
      : undefined
}

// A composite's `sortOrder view=+ tissue=+ age=+` ranks its subtracks by
// those subgroups in turn, each in the order its `subGroupN` line lists its
// values, so a time course reads in time order whatever its tables are named.
function sortOrderRank(composite: TrackDbEntry) {
  const keys = (parseTrackDbSettings(composite.settings).sortOrder ?? '')
    .trim()
    .split(/\s+/)
    .flatMap(key => {
      const [name = '', direction = '+'] = key.split('=')
      const ids = [...subGroupLabels(composite, name).keys()]
      return ids.length > 0
        ? [{ name, ids: direction === '-' ? ids.toReversed() : ids }]
        : []
    })
  return (settings: Record<string, string>) =>
    keys.reduce(
      (rank, { name, ids }) =>
        rank * (ids.length + 1) +
        ids.indexOf(subGroupTag(settings, name) ?? '') +
        1,
      0,
    )
}

export function combinedSources(
  tracksDb: Record<string, TrackDbEntry>,
  family: CombinedFamily,
  uriOf: (table: string) => string | undefined = () => undefined,
): CombinedSource[] {
  const composite = tracksDb[family.composite]
  const sortOrderOf = composite ? sortOrderRank(composite) : () => 0
  const members = Object.entries(tracksDb)
    .flatMap(([table, entry]) => {
      const settings = parseTrackDbSettings(entry.settings)
      const gbdbPath =
        entry.type.split(' ')[0] === family.type &&
        descendsFrom(tracksDb, table, family.composite)
          ? gbdbPathOf(settings, uriOf(table))
          : undefined
      return gbdbPath === undefined
        ? []
        : [
            {
              table,
              entry,
              settings,
              gbdbPath,
              place: placeOf(tracksDb, table, settings),
            },
          ]
    })
    .toSorted(
      (a, b) =>
        sortOrderOf(a.settings) - sortOrderOf(b.settings) ||
        a.place.parentPriority - b.place.parentPriority ||
        a.place.parent.localeCompare(b.place.parent) ||
        a.place.priority - b.place.priority ||
        a.table.localeCompare(b.table, undefined, { numeric: true }),
    )
  const { labels } = withoutSharedSuffix(members.map(m => m.entry.shortLabel))
  return members.map((m, i) => ({
    table: m.table,
    label: labels[i] ?? m.entry.shortLabel,
    gbdbPath: m.gbdbPath,
    settings: m.settings,
  }))
}

const PER_SOURCE_SETTINGS = new Set([
  'bigDataUrl',
  'longLabel',
  'parent',
  'priority',
  'shortLabel',
  'subGroups',
  'track',
  'visibility',
])

function mostCommon(values: string[]) {
  const counts = new Map<string, number>()
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts].toSorted((a, b) => b[1] - a[1])[0]?.[0]
}

const LINK_SETTINGS = ['url', 'urlLabel', 'urls']

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type SettingsSource = Pick<CombinedSource, 'label' | 'settings'>

function generalMouseOver({ label, settings }: SettingsSource) {
  const mouseOver = settings.mouseOver ?? ''
  return label
    ? mouseOver.replace(
        new RegExp(`(?<!\\w)${escapeRegExp(label)}(?!\\w)`, 'g'),
        '${source}',
      )
    : mouseOver
}

// The converter derives the tooltip, links and filters from these: a source
// with the commonest mouseOver once each names its own row as ${source}, and
// the composite's links where that source has none.
function sharedSettings(sources: SettingsSource[], composite: TrackDbEntry) {
  const mouseOvers = sources.map(generalMouseOver)
  const common = mostCommon(mouseOvers)
  const representative = sources[Math.max(0, mouseOvers.indexOf(common ?? ''))]
  const inherited = parseTrackDbSettings(composite.settings)
  const links =
    inherited.noInherit === 'on'
      ? {}
      : Object.fromEntries(
          LINK_SETTINGS.flatMap(key =>
            inherited[key] ? [[key, inherited[key]]] : [],
          ),
        )
  const own = Object.fromEntries(
    Object.entries(representative?.settings ?? {}).filter(
      ([key]) => !PER_SOURCE_SETTINGS.has(key),
    ),
  )
  return { ...links, ...own, ...(common ? { mouseOver: common } : {}) }
}

// A composite's `subGroup2 tissue Tissue t01_thymus=Thymus t02_spleen=Spleen`
// as tag -> label, in the order written
function subGroupLabels(composite: TrackDbEntry, name: string) {
  const definition = Object.entries(parseTrackDbSettings(composite.settings))
    .filter(([key]) => /^subGroup\d+$/.test(key))
    .map(([, value]) => value.trim().split(/\s+/))
    .find(([group]) => group === name)
  return new Map(
    (definition ?? []).slice(2).map(tag => {
      const [id = '', label = id] = tag.split('=')
      return [id, label.replaceAll('_', ' ')] as const
    }),
  )
}

// The value a subtrack's `subGroups view=Signal tissue=t01_thymus` gives one
function subGroupTag(settings: Record<string, string>, name: string) {
  return (settings.subGroups ?? '')
    .trim()
    .split(/\s+/)
    .map(pair => pair.split('='))
    .find(([group]) => group === name)?.[1]
}

// Each member's row label: its shortLabel less the words every member shares
// at either end, and, where two still read alike, the subgroup values that
// tell them apart ("Brain Forward", "Brain Reverse"), which are the whole
// label where every member reads alike.
export function rowLabels(
  tracksDb: Record<string, TrackDbEntry>,
  members: string[],
) {
  const { labels: trimmed } = withoutSharedSuffix(
    members.map(m => tracksDb[m]?.shortLabel ?? m),
  )
  const { labels } = withoutSharedPrefix(trimmed)
  const subGroups = members.map(m =>
    subGroupMetadata(
      Object.fromEntries(
        trackDbLineage(tracksDb, m)
          .toReversed()
          .flatMap(table =>
            Object.entries(
              parseTrackDbSettings(tracksDb[table]?.settings ?? ''),
            ),
          ),
      ),
    ),
  )
  const told = labels.map((label, i) => {
    const alike = subGroups.filter((_, j) => labels[j] === label)
    const own = subGroups[i] ?? {}
    const telling =
      alike.length > 1
        ? Object.entries(own).flatMap(([key, value]) =>
            alike.some(other => other[key] !== value) ? [value] : [],
          )
        : []
    return (
      telling.length > 0 && alike.length === labels.length
        ? telling
        : [label, ...telling]
    ).join(' ')
  })
  return told.map((label, i) =>
    told.indexOf(label) === told.lastIndexOf(label)
      ? label
      : `${label} ${members[i]}`,
  )
}

// A faceted composite's `dataTypes acc|"Percent accessible" peaks|"FIRE peaks"`
function dataTypeLabels(composite: TrackDbEntry) {
  const { dataTypes = '' } = parseTrackDbSettings(composite.settings)
  return new Map(
    [...dataTypes.matchAll(/([^\s|]+)\|(?:"([^"]*)"|(\S+))/g)].map(
      ([, key = '', quoted, bare]) => [key, quoted ?? bare ?? key] as const,
    ),
  )
}

// The composite's own subtrack a source sits in: the source, or the multiWig
// container holding it. A view stanza between the two is neither.
function memberOf(
  tracksDb: Record<string, TrackDbEntry>,
  table: string,
  composite: string,
) {
  return (
    belowComposite(tracksDb, table, composite).findLast(
      ancestor =>
        parseTrackDbSettings(tracksDb[ancestor]?.settings ?? '').container ===
        'multiWig',
    ) ?? table
  )
}

// A member is named `<composite>_<sample>_<data type>`
function dataTypeOf(member: string, labels: Map<string, string>) {
  const suffix = member.split('_').at(-1) ?? ''
  return labels.has(suffix) ? suffix : undefined
}

function belowComposite(
  tracksDb: Record<string, TrackDbEntry>,
  table: string,
  composite: string,
) {
  const lineage = trackDbLineage(tracksDb, table)
  return lineage.slice(0, Math.max(0, lineage.indexOf(composite)))
}

function naming(
  composite: TrackDbEntry,
  members: TrackDbEntry[],
  dataTypeLabel: string | undefined,
  standsAlone = false,
) {
  const { suffix } = withoutSharedSuffix(members.map(m => m.shortLabel))
  const { suffix: sharedLongLabel } = withoutSharedSuffix(
    members.map(m => m.longLabel),
  )
  return dataTypeLabel
    ? {
        name: `${composite.shortLabel} - ${dataTypeLabel}`,
        description: `${sharedLongLabel || composite.longLabel}: ${members.length} samples, one row each`,
      }
    : {
        name: `${composite.shortLabel}${suffix ? ` - ${suffix}` : ''}${standsAlone ? '' : ' (combined)'}`,
        description: `${composite.longLabel}: ${members.length} subtracks in one track, one row each`,
      }
}

function entriesOf(tracksDb: Record<string, TrackDbEntry>, tables: string[]) {
  return tables.flatMap(table => {
    const entry = tracksDb[table]
    return entry ? [entry] : []
  })
}

export function combinedTrack(
  assemblyName: string,
  family: CombinedFamily,
  tracksDb: Record<string, TrackDbEntry>,
  sources = combinedSources(tracksDb, family),
): UcscTrack | undefined {
  const composite = tracksDb[family.composite]
  return composite && sources.length > 1
    ? trackOver(assemblyName, family, composite, sources, tracksDb)
    : undefined
}

function trackOver(
  assemblyName: string,
  family: CombinedFamily,
  composite: TrackDbEntry,
  sources: CombinedSource[],
  tracksDb: Record<string, TrackDbEntry>,
): UcscTrack {
  const trackId = `${assemblyName}-${combinedKey(family)}`
  const labels = dataTypeLabels(composite)
  const dataTypes = new Set(
    sources.map(s =>
      dataTypeOf(memberOf(tracksDb, s.table, family.composite), labels),
    ),
  )
  const [dataType] = dataTypes
  const sort = sources.map(s => s.label)
  const sections = {
    type: 'LinearBasicDisplay',
    displayId: `${trackId}-LinearBasicDisplay`,
    facet: { field: 'source', sort },
    maxFeatureScreenDensity: sources.length,
  }
  const colors = Object.fromEntries(
    sources.flatMap(s =>
      s.settings.color ? [[s.label, `rgb(${s.settings.color})`]] : [],
    ),
  )
  const rows = {
    type: 'LinearMultiRowFeatureDisplay',
    displayId: `${trackId}-LinearMultiRowFeatureDisplay`,
    rows: {
      field: 'source',
      sort,
      ...(Object.keys(colors).length > 0 ? { colors } : {}),
    },
  }
  const file = combinedFile(family)
  return {
    type: 'FeatureTrack',
    trackId,
    ...naming(
      composite,
      entriesOf(
        tracksDb,
        sources.map(s => s.table),
      ),
      dataTypes.size === 1 && dataType ? labels.get(dataType) : undefined,
    ),
    category: composite.grp ? [categoryLabel(composite.grp)] : [],
    assemblyNames: [assemblyName],
    adapter: derivesFile(family)
      ? {
          type: 'BedTabixAdapter',
          bedGzLocation: { uri: file },
          index: { indexType: 'CSI', location: { uri: `${file}.csi` } },
        }
      : {
          type: 'MultiWiggleAdapter',
          subadapters: sources.map(s => ({
            type: 'BigBedAdapter',
            source: s.label,
            bigBedLocation: {
              locationType: 'UriLocation',
              uri: `${HGDOWNLOAD}/gbdb/${s.gbdbPath}`,
            },
          })),
        },
    metadata: {
      ucsc: withDescriptionLink(
        sharedSettings(sources, composite),
        assemblyName,
        family.composite,
        composite.html,
      ),
    },
    displays: family.display === 'rows' ? [rows, sections] : [sections, rows],
  }
}

function signalTrack(
  assemblyName: string,
  family: CombinedFamily,
  composite: TrackDbEntry,
  tracksDb: Record<string, TrackDbEntry>,
  part: { key: string; label?: string; sources: CombinedSource[] },
): UcscTrack {
  const { sources } = part
  const trackId = `${assemblyName}-${family.composite}-${part.key}`
  const memberTables = sources.map(s =>
    memberOf(tracksDb, s.table, family.composite),
  )
  const members = [...new Set(memberTables)]
  const memberEntries = entriesOf(tracksDb, members)
  const samples = rowLabels(tracksDb, members)
  const sampleOf = new Map(members.map((m, i) => [m, samples[i] ?? m]))
  const colors = new Set(sources.map(s => s.settings.color))
  const grouped = sources.some((s, i) => memberTables[i] !== s.table)
  const ucsc = sharedSettings(
    memberEntries.map(entry => ({
      label: sampleOf.get(entry.tableName) ?? entry.tableName,
      settings: parseTrackDbSettings(entry.settings),
    })),
    composite,
  )
  const display = getUcscWiggleDisplay(trackId, ucsc) ?? {
    type: 'LinearWiggleDisplay',
    displayId: `${trackId}-LinearWiggleDisplay`,
  }
  return {
    type: 'MultiQuantitativeTrack',
    trackId,
    ...naming(composite, memberEntries, part.label, true),
    category: composite.grp ? [categoryLabel(composite.grp)] : [],
    assemblyNames: [assemblyName],
    adapter: {
      type: 'MultiWiggleAdapter',
      subadapters: sources.map((s, i) => {
        const member = memberTables[i] ?? s.table
        const sample = sampleOf.get(member) ?? member
        return {
          type: 'BigWigAdapter',
          name:
            member === s.table
              ? sample
              : (tracksDb[s.table]?.shortLabel ?? s.table),
          ...(member === s.table ? {} : { group: sample }),
          ...(colors.size > 1 && s.settings.color
            ? { color: `rgb(${s.settings.color})` }
            : {}),
          bigWigLocation: { uri: `${HGDOWNLOAD}/gbdb/${s.gbdbPath}` },
        }
      }),
    },
    metadata: {
      ucsc: withDescriptionLink(
        ucsc,
        assemblyName,
        family.composite,
        composite.html,
      ),
    },
    displays: [
      {
        ...display,
        ...(family.height === undefined ? {} : { height: family.height }),
        rows: { field: grouped ? 'group' : 'source' },
      },
    ],
  }
}

// A faceted composite's bigWigs make one track per data type, a split
// family's one per value of its subgroup, any other composite's one track
export function signalTracks(
  assemblyName: string,
  family: CombinedFamily,
  tracksDb: Record<string, TrackDbEntry>,
  sources = combinedSources(tracksDb, family),
) {
  const composite = tracksDb[family.composite]
  const labels = composite
    ? dataTypeLabels(composite)
    : new Map<string, string>()
  const { splitBy } = family
  const parts =
    labels.size > 0
      ? [...labels].map(([key, label]) => ({
          key,
          label,
          sources: sources.filter(
            s =>
              dataTypeOf(
                memberOf(tracksDb, s.table, family.composite),
                labels,
              ) === key,
          ),
        }))
      : composite && splitBy
        ? [...subGroupLabels(composite, splitBy)].map(([key, label]) => ({
            key,
            label,
            sources: sources.filter(
              s => subGroupTag(s.settings, splitBy) === key,
            ),
          }))
        : [{ key: family.type, sources }]
  return composite
    ? parts
        .filter(part => part.sources.length > 1)
        .map(part => ({
          track: signalTrack(assemblyName, family, composite, tracksDb, part),
          sources: part.sources,
        }))
    : []
}

// One 404 subadapter fails a whole MultiWiggleAdapter, so an adapters family
// keeps only the sources the url check passes.
async function reachableSources(
  assemblyName: string,
  tracksDb: Record<string, TrackDbEntry>,
  family: CombinedFamily,
  uriOf: (table: string) => string | undefined,
) {
  const sources = combinedSources(tracksDb, family, uriOf)
  const reachable = await Promise.all(
    sources.map(s =>
      checkIfFileAccessible({
        url: `${HGDOWNLOAD}/gbdb/${s.gbdbPath}`,
        assembly: assemblyName,
        trackName: tracksDb[s.table]?.longLabel ?? s.table,
      }),
    ),
  )
  return sources.filter((_, i) => reachable[i])
}

function withSources(track: UcscTrack | undefined, sources: CombinedSource[]) {
  return track ? [{ track, sources }] : []
}

async function familyTracks(
  assemblyName: string,
  tracksDb: Record<string, TrackDbEntry>,
  family: CombinedFamily,
  dir: string,
  uriOf: (table: string) => string | undefined,
) {
  const sources = derivesFile(family)
    ? combinedSources(tracksDb, family)
    : await reachableSources(assemblyName, tracksDb, family, uriOf)
  return family.type === SIGNAL_TYPE
    ? signalTracks(assemblyName, family, tracksDb, sources)
    : !derivesFile(family) ||
        fs.existsSync(path.join(dir, `${combinedFile(family)}.csi`))
      ? withSources(
          combinedTrack(assemblyName, family, tracksDb, sources),
          sources,
        )
      : []
}

// The subtracks a signal family's track, or a faceted composite's, stands
// for, and the multiWig containers they sit in
export function replacedTrackIds(
  assemblyName: string,
  tracksDb: Record<string, TrackDbEntry>,
  family: CombinedFamily,
  sources: CombinedSource[],
) {
  const composite = tracksDb[family.composite]
  return composite &&
    (family.type === SIGNAL_TYPE || dataTypeLabels(composite).size > 0)
    ? sources.flatMap(s =>
        belowComposite(tracksDb, s.table, family.composite).map(
          table => `${assemblyName}-${table}`,
        ),
      )
    : []
}

export const addCombinedTracks: FinalizeStep = {
  name: 'combined composite tracks',
  run: async ({ assemblyName, tracksDb, config, dir }) => {
    const families = tracksDb ? readCombinedFamilies(assemblyName) : []
    const uris = new Map(
      config.tracks.flatMap(track => {
        const { type, uri } = track.adapter
        return type === 'BigWigAdapter' && isString(uri)
          ? [[track.trackId, uri] as const]
          : []
      }),
    )
    const uriOf = (table: string) => uris.get(`${assemblyName}-${table}`)
    const perFamily = tracksDb
      ? await Promise.all(
          families.map(async family =>
            (
              await familyTracks(assemblyName, tracksDb, family, dir, uriOf)
            ).map(({ track, sources }) => ({
              track,
              replaces: replacedTrackIds(
                assemblyName,
                tracksDb,
                family,
                sources,
              ),
            })),
          ),
        )
      : []
    const built = perFamily.flat()
    const replaced = new Set(built.flatMap(b => b.replaces))
    const before = config.tracks.length
    config.tracks = [
      ...config.tracks.filter(track => !replaced.has(track.trackId)),
      ...built.map(b => b.track),
    ]
    return {
      added: built.length,
      replaced: before + built.length - config.tracks.length,
      skipped: perFamily.filter(tracks => tracks.length === 0).length,
    }
  },
}

export function autoSqlFields(autoSql: string) {
  return autoSql
    .split('\n')
    .filter(line => line.includes(';') && !/^\s*(table|\(|\))/.test(line))
    .flatMap(line => {
      const name = /(\w+)\s*;/.exec(line)?.[1]
      return name ? [name] : []
    })
}

export function unionColumns(fieldLists: string[][]) {
  return [...new Set(fieldLists.flat())]
}

export function combinedLine(
  union: string[],
  fields: string[],
  values: (string | number)[],
  source: string,
) {
  const byName = new Map(fields.map((f, i) => [f, values[i]]))
  return `${[...union.map(c => byName.get(c) ?? ''), source].join('\t')}\n`
}

async function writeCombinedBed(
  sources: CombinedSource[],
  gbdbDir: string,
  out: NodeJS.WritableStream,
) {
  const write = async (text: string) => {
    if (!out.write(text)) {
      await once(out, 'drain')
    }
  }
  const opened = await Promise.all(
    sources.map(async source => {
      const bb = new BigBed({ path: path.join(gbdbDir, source.gbdbPath) })
      const header = await bb.getHeader()
      return { source, bb, header, fields: autoSqlFields(header.autoSql) }
    }),
  )
  const union = unionColumns(opened.map(o => o.fields))
  await write(`#${[...union, 'source'].join('\t')}\n`)
  let total = 0
  for (const { source, bb, header, fields } of opened) {
    for (const ref of Object.values(header.refsByNumber)) {
      const features = await bb.getFeatures(ref.name, 0, ref.length)
      total += features.length
      await write(
        features
          .map(f =>
            combinedLine(
              union,
              fields,
              [ref.name, f.start, f.end, ...(f.rest ? f.rest.split('\t') : [])],
              source.label,
            ),
          )
          .join(''),
      )
    }
  }
  if (total === 0) {
    throw new Error(`no features in any of ${sources.length} sources`)
  }
}

// CLI, for createCombinedTracks.sh:
//   sources <db> <tracks.json>   prints key, label and gbdb path per source
//   combine <db> <tracks.json> <key> <gbdbDir>   prints the unsorted BED
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, db, tracksJson, key, gbdbDir] = process.argv.slice(2)
  if (!db || !tracksJson) {
    console.error(
      'Usage: node combinedTracks.ts sources|combine <db> <tracks.json> [<key> <gbdbDir>]',
    )
    process.exit(1)
  }
  const tracksDb = readChecked(tracksJson, isTrackDb)
  const families = readCombinedFamilies(db)
  if (command === 'sources') {
    for (const family of families.filter(derivesFile)) {
      const sources = combinedSources(tracksDb, family)
      if (sources.length < 2) {
        console.error(
          `${db}: ${combinedKey(family)} has ${sources.length} sources in trackDb; not combining it`,
        )
      } else {
        for (const s of sources) {
          console.log(`${combinedKey(family)}\t${s.label}\t${s.gbdbPath}`)
        }
      }
    }
  } else {
    const family = families.find(f => combinedKey(f) === key)
    if (command !== 'combine' || !family || !gbdbDir) {
      console.error(`Unknown command or family: ${command} ${key ?? ''}`)
      process.exit(1)
    }
    await writeCombinedBed(
      combinedSources(tracksDb, family),
      gbdbDir,
      process.stdout,
    )
  }
}
