import { once } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BigBed } from '@gmod/bbi'
import { categoryLabel, isArrayOf, isShape, isString } from 'hubtools'

import { isTrackDb } from './guards.ts'
import { UCSC_ROOT, readChecked, replaceLink } from './util.ts'
import {
  parentTrackName,
  parseTrackDbSettings,
} from './utils/trackDbSettings.ts'

import type { TrackDbEntry, UcscTrack } from './types.ts'
import type { FinalizeStep } from './utils/finalizeStep.ts'
import type { Guard } from 'hubtools'

/**
 * A UCSC composite whose bigBed subtracks of one type become one track over
 * one tabix-indexed BED, a row per subtrack in a `source` column. The
 * subtracks are read from trackDb on every run, so a sample UCSC adds or drops
 * joins or leaves the file with no edit here. `display` picks the display the
 * track opens on: `rows` (one fixed row per source) or `sections` (each
 * source packed in its own section, keeping labels).
 */
export interface CombinedFamily {
  composite: string
  type: string
  display: 'rows' | 'sections'
}

const isDisplayChoice: Guard<CombinedFamily['display']> = (
  v: unknown,
): v is CombinedFamily['display'] => v === 'rows' || v === 'sections'

const isCombinedFamilies: Guard<CombinedFamily[]> = isArrayOf(
  isShape({ composite: isString, type: isString, display: isDisplayChoice }),
)

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

export function combinedSources(
  tracksDb: Record<string, TrackDbEntry>,
  family: CombinedFamily,
): CombinedSource[] {
  const members = Object.entries(tracksDb)
    .map(([table, entry]) => ({
      table,
      entry,
      settings: parseTrackDbSettings(entry.settings),
    }))
    .filter(
      ({ table, entry, settings }) =>
        entry.type.split(' ')[0] === family.type &&
        settings.bigDataUrl?.startsWith('/gbdb/') &&
        descendsFrom(tracksDb, table, family.composite),
    )
    .toSorted(
      (a, b) =>
        Number(a.settings.priority ?? Infinity) -
          Number(b.settings.priority ?? Infinity) ||
        a.table.localeCompare(b.table),
    )
  const { labels } = withoutSharedSuffix(members.map(m => m.entry.shortLabel))
  return members.map((m, i) => ({
    table: m.table,
    label: labels[i] ?? m.entry.shortLabel,
    gbdbPath: m.settings.bigDataUrl!.slice('/gbdb/'.length),
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

function generalMouseOver({ label, settings }: CombinedSource) {
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
function sharedSettings(sources: CombinedSource[], composite: TrackDbEntry) {
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

export function combinedTrack(
  assemblyName: string,
  family: CombinedFamily,
  tracksDb: Record<string, TrackDbEntry>,
): UcscTrack | undefined {
  const composite = tracksDb[family.composite]
  const sources = combinedSources(tracksDb, family)
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
  const { suffix } = withoutSharedSuffix(
    sources.map(s => tracksDb[s.table]?.shortLabel ?? s.label),
  )
  const sort = sources.map(s => s.label)
  const sections = {
    type: 'LinearBasicDisplay',
    displayId: `${trackId}-LinearBasicDisplay`,
    facet: { field: 'source', sort },
    maxFeatureScreenDensity: sources.length,
  }
  const rows = {
    type: 'LinearMultiRowFeatureDisplay',
    displayId: `${trackId}-LinearMultiRowFeatureDisplay`,
    rows: { field: 'source', sort },
  }
  const file = combinedFile(family)
  return {
    type: 'FeatureTrack',
    trackId,
    name: `${composite.shortLabel}${suffix ? ` - ${suffix}` : ''} (combined)`,
    description: `${composite.longLabel}: ${sources.length} subtracks in one track, one row each`,
    category: composite.grp ? [categoryLabel(composite.grp)] : [],
    assemblyNames: [assemblyName],
    adapter: {
      type: 'BedTabixAdapter',
      bedGzLocation: { uri: file },
      index: { indexType: 'CSI', location: { uri: `${file}.csi` } },
    },
    metadata: {
      ucsc: {
        ...sharedSettings(sources, composite),
        html: replaceLink(composite.html),
      },
    },
    displays: family.display === 'rows' ? [rows, sections] : [sections, rows],
  }
}

export const addCombinedTracks: FinalizeStep = {
  name: 'combined composite tracks',
  run: ({ assemblyName, tracksDb, config, dir }) => {
    const families = tracksDb ? readCombinedFamilies(assemblyName) : []
    const tracks = families.flatMap(family => {
      const file = path.join(dir, combinedFile(family))
      const track =
        tracksDb && fs.existsSync(`${file}.csi`)
          ? combinedTrack(assemblyName, family, tracksDb)
          : undefined
      return track ? [track] : []
    })
    config.tracks.push(...tracks)
    return {
      added: tracks.length,
      skipped: families.length - tracks.length,
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
    for (const family of families) {
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
