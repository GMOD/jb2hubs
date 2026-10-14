// Measures which column a UCSC bigBed's itemRgb follows, for the itemRgb-on
// tracks neither hubtools' fieldColorPalettes.ts nor itemRgbLegends.ts lists
// yet. It samples features across the largest chromosomes and reports each
// column whose value fixes the color, as categories or as steps over a numeric
// column.
//
//   node src/measureItemRgbPalettes.ts [--only a,b] [--limit n] > report.json
import fs from 'node:fs'
import path from 'node:path'

import { BigBed } from '@gmod/bbi'
import { UCSC_FIELD_PALETTES, ucscItemRgbLegend } from 'hubtools'

const MAX_FEATURES = 15_000
const MAX_WINDOW_BYTES = 3_000_000
const MAX_CHROMS = 8
const MAX_VALUES = 40
const REQUESTS_PER_SECOND = 2
const SKIP = new Set([
  'chrom',
  'chromStart',
  'chromEnd',
  'thickStart',
  'thickEnd',
  'blockCount',
  'blockSizes',
  'chromStarts',
  'blockStarts',
])

const realFetch = globalThis.fetch
let nextSlot = 0
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const now = Date.now()
  const slot = Math.max(now, nextSlot)
  nextSlot = slot + 1000 / REQUESTS_PER_SECOND
  await new Promise(resolve => setTimeout(resolve, slot - now))
  return realFetch(...args)
}

interface Candidate {
  track: string
  trackId: string
  url: string
}

function argValue(name: string) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function bigBedUrl(adapter: unknown) {
  if (!isRecord(adapter) || adapter.type !== 'BigBedAdapter') {
    return undefined
  }
  const loc = adapter.bigBedLocation
  const uri = adapter.uri ?? (isRecord(loc) ? loc.uri : undefined)
  return typeof uri === 'string' ? uri : undefined
}

// One file per track name, hg38's where it has one; a family of per-sample
// tracks (sgdpCopyNumber_*) is one name for this, three of its files read
function candidates(configDir: string) {
  const byName = new Map<string, Candidate[]>()
  for (const file of fs.readdirSync(configDir).sort()) {
    if (!file.endsWith('.json')) {
      continue
    }
    let config: unknown
    try {
      config = JSON.parse(fs.readFileSync(path.join(configDir, file), 'utf8'))
    } catch {
      continue
    }
    const tracks =
      isRecord(config) && Array.isArray(config.tracks) ? config.tracks : []
    for (const track of tracks) {
      const metadata = isRecord(track) ? track.metadata : undefined
      const ucsc = isRecord(metadata) ? metadata.ucsc : undefined
      const url = isRecord(track) ? bigBedUrl(track.adapter) : undefined
      if (
        !isRecord(track) ||
        !isRecord(ucsc) ||
        url === undefined ||
        String(ucsc.itemRgb).toLowerCase() !== 'on' ||
        'filterValues.itemRgb' in ucsc ||
        (typeof ucsc.track === 'string' &&
          (Object.hasOwn(UCSC_FIELD_PALETTES, ucsc.track) ||
            ucscItemRgbLegend(ucsc.track) !== undefined))
      ) {
        continue
      }
      const name = String(ucsc.track ?? track.trackId)
      const family = name.replace(/_.*$/, '')
      const entry = { track: name, trackId: String(track.trackId), url }
      const list = byName.get(family) ?? []
      if (!list.some(c => c.url === url)) {
        list.push(entry)
      }
      byName.set(family, list)
    }
  }
  return [...byName.entries()].map(([family, list]) => {
    const hg38 = list.filter(c => c.trackId.startsWith('hg38-'))
    const preferred = hg38.length > 0 ? hg38 : list
    return { family, files: preferred.slice(0, 3) }
  })
}

function autoSqlFields(autoSql: string) {
  const body = autoSql.slice(autoSql.indexOf('(') + 1, autoSql.lastIndexOf(')'))
  return [
    ...body.matchAll(
      /^\s*[\w[\]]+(?:\s+[\w[\]]+)?\s+(\w+)\s*;\s*(?:"([^"]*)")?/gm,
    ),
  ].map(m => ({ name: m[1]!, description: m[2] ?? '' }))
}

function rgbOf(raw: string) {
  const value = raw.trim()
  if (value.includes(',')) {
    const parts = value.split(',').filter(p => p !== '')
    return parts.length === 3 && parts.every(p => /^\d+$/.test(p) && +p <= 255)
      ? parts.map(Number).join(',')
      : undefined
  }
  if (!/^\d+$/.test(value) || +value > 0xffffff) {
    return undefined
  }
  const n = +value
  return `${n >> 16},${(n >> 8) & 255},${n & 255}`
}

async function sample(url: string) {
  const bb = new BigBed({ url })
  const header = await bb.getHeader()
  const fields = autoSqlFields(header.autoSql)
  const names = fields.map(f => f.name)
  const refs = Object.values(header.refsByNumber)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_CHROMS)
  const rows: Record<string, string>[] = []
  for (const ref of refs) {
    let start = 0
    let end = ref.length
    while (
      end - start > 10_000 &&
      (await bb.getRegionByteSize(ref.name, start, end)) > MAX_WINDOW_BYTES
    ) {
      const quarter = Math.floor((end - start) / 4)
      start += quarter
      end -= quarter
    }
    for (const f of await bb.getFeatures(ref.name, start, end)) {
      const rest = (f.rest ?? '').split('\t')
      const row: Record<string, string> = {}
      for (const [i, value] of rest.entries()) {
        row[names[i + 3] ?? `field${i + 3}`] = value
      }
      rows.push(row)
    }
    if (rows.length >= MAX_FEATURES) {
      break
    }
  }
  return { fields, names, rows: rows.slice(0, MAX_FEATURES) }
}

function colorColumn(names: string[]) {
  return names.find(n => n === 'itemRgb' || n === 'reserved') ?? names[8]
}

function measure(names: string[], rows: Record<string, string>[]) {
  const colorName = colorColumn(names)
  const colors = new Map<string, number>()
  const rgbs = rows.map(row => rgbOf(row[colorName ?? ''] ?? ''))
  for (const rgb of rgbs) {
    colors.set(String(rgb), (colors.get(String(rgb)) ?? 0) + 1)
  }
  const columns = []
  for (const name of names) {
    if (SKIP.has(name) || name === colorName) {
      continue
    }
    const palette = new Map<string, Map<string, number>>()
    for (const [i, row] of rows.entries()) {
      const value = row[name] ?? ''
      const byColor = palette.get(value) ?? new Map<string, number>()
      byColor.set(String(rgbs[i]), (byColor.get(String(rgbs[i])) ?? 0) + 1)
      palette.set(value, byColor)
      if (palette.size > 2000) {
        break
      }
    }
    const strays = [...palette.values()].reduce(
      (n, byColor) =>
        n +
        [...byColor.values()].reduce((a, b) => a + b, 0) -
        Math.max(...byColor.values()),
      0,
    )
    const values = [...palette.entries()]
      .map(([value, byColor]) => {
        const [rgb, count] = [...byColor.entries()].sort(
          (a, b) => b[1] - a[1],
        )[0]!
        return {
          value,
          rgb,
          count: [...byColor.values()].reduce((a, b) => a + b, 0),
          purity: count / [...byColor.values()].reduce((a, b) => a + b, 0),
        }
      })
      .sort((a, b) => b.count - a.count)
    const numeric =
      values.length > 0 &&
      values.every(v => v.value !== '' && Number.isFinite(Number(v.value)))
    const categorical = palette.size <= MAX_VALUES && palette.size > 1
    const steps =
      numeric && !categorical ? thresholdSteps(name, rows, rgbs) : undefined
    if ((categorical && strays / rows.length < 0.01) || steps) {
      columns.push({
        name,
        distinct: palette.size,
        strays,
        ...(categorical ? { values } : {}),
        ...(steps ? { steps } : {}),
      })
    }
  }
  return {
    colorColumn: colorName,
    colors: [...colors.entries()].sort((a, b) => b[1] - a[1]),
    columns,
  }
}

// Whether the color is a step function of a numeric column: sorted by value,
// the color changes at no more than a few cut points, each crossed once
function thresholdSteps(
  name: string,
  rows: Record<string, string>[],
  rgbs: (string | undefined)[],
) {
  const pairs = rows
    .map((row, i) => ({ v: Number(row[name]), rgb: String(rgbs[i]) }))
    .sort((a, b) => a.v - b.v)
  const runs: { from: number; to: number; rgb: string; n: number }[] = []
  for (const { v, rgb } of pairs) {
    const last = runs.at(-1)
    if (last?.rgb === rgb) {
      last.to = v
      last.n++
    } else {
      runs.push({ from: v, to: v, rgb, n: 1 })
    }
  }
  const seen = new Set(runs.map(r => r.rgb))
  return runs.length > 1 && runs.length <= 12 && seen.size === runs.length
    ? runs
    : undefined
}

const configDir = path.resolve(import.meta.dirname, '../configs')
const only = argValue('--only')?.split(',')
const limit = Number(argValue('--limit') ?? Infinity)
const todo = candidates(configDir)
  .filter(c => !only || only.includes(c.family))
  .slice(0, limit)
console.error(`${todo.length} track families`)
const report = []
for (const { family, files } of todo) {
  for (const file of files) {
    try {
      const { fields, names, rows } = await sample(file.url)
      const result = {
        family,
        ...file,
        features: rows.length,
        descriptions: Object.fromEntries(
          fields.map(f => [f.name, f.description]),
        ),
        ...measure(names, rows),
      }
      report.push(result)
      console.error(
        `${file.trackId}: ${rows.length} features, ${result.colors.length} colors, columns ${result.columns.map(c => c.name).join(' ') || '-'}`,
      )
    } catch (e) {
      report.push({ family, ...file, error: String(e) })
      console.error(`${file.trackId}: ${String(e)}`)
    }
  }
}
console.log(JSON.stringify(report, null, 1))
