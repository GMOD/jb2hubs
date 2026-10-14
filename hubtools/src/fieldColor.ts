// Carries a bigBed's `itemRgb on` into v5's color: names its colors in the key
// from the labels its trackDb `filterValues.itemRgb` pairs them with, or for a
// track whose itemRgb follows one column, paints that column with the colors
// UCSC gave it. Any other `itemRgb on` track gets a bare identity scale, under
// which v5 paints an itemRgb of 0,0,0 black as UCSC does. A v4 host has no
// `color` slot on LinearBasicDisplay, drops the setting and still paints the
// itemRgb.
import { UCSC_FIELD_PALETTES } from './fieldColorPalettes.ts'

export interface ItemRgbOn {
  scale: 'identity'
}

export interface ItemRgbKey extends ItemRgbOn {
  domain: string[]
  labels: string[]
  title?: string
}

export interface FieldColorScale {
  field: string
  scale: 'categorical'
  domain: string[]
  range: string[]
  labels?: string[]
  title: string
}

export interface ColorDisplay {
  type: 'LinearBasicDisplay'
  displayId: string
  color: ItemRgbOn | ItemRgbKey | FieldColorScale
}

function rgbOf(value: string) {
  const channels = value.split(',')
  return channels.length === 3 &&
    channels.every(c => /^\d{1,3}$/.test(c) && Number(c) <= 255)
    ? `rgb(${channels.join(',')})`
    : undefined
}

// trackDb separates entries with one comma and writes a literal comma as two:
// `255,,0,,0|Protein-altering,0,,128,,0|Synonymous`. A label that starts or
// ends with a comma cannot be split unambiguously, so the parser refuses it.
export function parseItemRgbValues(setting: string) {
  if (/,{3}/.test(setting)) {
    return undefined
  }
  const entries = setting.split(/(?<!,),(?!,)/).map(entry => {
    const bar = entry.indexOf('|')
    const color = rgbOf(entry.slice(0, bar).replaceAll(',,', ',').trim())
    const label = entry
      .slice(bar + 1)
      .replaceAll(',,', ',')
      .trim()
    return bar > 0 &&
      color !== undefined &&
      label !== '' &&
      !label.startsWith(',') &&
      !label.endsWith(',')
      ? { color, label }
      : undefined
  })
  return entries.length > 0 && entries.every(e => e !== undefined)
    ? entries
    : undefined
}

function itemRgbOn({ itemRgb }: Record<string, unknown>) {
  return typeof itemRgb === 'string' && itemRgb.toLowerCase() === 'on'
}

export function ucscItemRgbKey(
  ucsc: Record<string, unknown>,
): ItemRgbKey | undefined {
  const setting = ucsc['filterValues.itemRgb']
  const title = ucsc['filterLabel.itemRgb']
  const entries =
    itemRgbOn(ucsc) && typeof setting === 'string'
      ? parseItemRgbValues(setting)
      : undefined
  return entries
    ? {
        scale: 'identity',
        domain: entries.map(e => e.color),
        labels: entries.map(e => e.label),
        ...(typeof title === 'string' && title !== '' ? { title } : {}),
      }
    : undefined
}

export function ucscFieldColor(
  ucsc: Record<string, unknown>,
): FieldColorScale | undefined {
  const palette =
    itemRgbOn(ucsc) && typeof ucsc.track === 'string'
      ? UCSC_FIELD_PALETTES[ucsc.track]
      : undefined
  return palette
    ? {
        field: palette.field,
        scale: 'categorical',
        domain: palette.values.map(([value]) => value),
        range: palette.values.map(([, rgb]) => `rgb(${rgb})`),
        ...(palette.values.some(([, , label]) => label !== undefined)
          ? { labels: palette.values.map(([value, , label]) => label ?? value) }
          : {}),
        title: palette.title,
      }
    : undefined
}

export function getUcscColorDisplay(
  trackId: string,
  ucsc: Record<string, unknown>,
): ColorDisplay | undefined {
  const color =
    ucscItemRgbKey(ucsc) ??
    ucscFieldColor(ucsc) ??
    (itemRgbOn(ucsc) ? { scale: 'identity' as const } : undefined)
  return color
    ? {
        type: 'LinearBasicDisplay',
        displayId: `${trackId}-LinearBasicDisplay`,
        color,
      }
    : undefined
}
