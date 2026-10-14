// Names a bigBed's itemRgb colors in v5's color key, from the labels its
// trackDb `filterValues.itemRgb` pairs them with. A v4 host has no `color` slot
// on LinearBasicDisplay, drops the setting and still paints the itemRgb.

export interface ItemRgbKey {
  scale: 'identity'
  domain: string[]
  labels: string[]
  title?: string
}

export interface ColorDisplay {
  type: 'LinearBasicDisplay'
  displayId: string
  color: ItemRgbKey
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

export function ucscItemRgbKey(
  ucsc: Record<string, unknown>,
): ItemRgbKey | undefined {
  const { itemRgb } = ucsc
  const setting = ucsc['filterValues.itemRgb']
  const title = ucsc['filterLabel.itemRgb']
  const entries =
    typeof itemRgb === 'string' &&
    itemRgb.toLowerCase() === 'on' &&
    typeof setting === 'string'
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

export function getUcscColorDisplay(
  trackId: string,
  ucsc: Record<string, unknown>,
): ColorDisplay | undefined {
  const color = ucscItemRgbKey(ucsc)
  return color
    ? {
        type: 'LinearBasicDisplay',
        displayId: `${trackId}-LinearBasicDisplay`,
        color,
      }
    : undefined
}
