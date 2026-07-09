// Derives a JBrowse LinearBasicDisplay from the UCSC trackDb label/mouseover
// settings that ride along in a track's metadata.ucsc. Targets the current
// (canvas) config shape where `labels` and `mouseover` sit directly on the
// display rather than under a renderer.

export interface FeatureDisplay {
  displays: {
    type: string
    displayId: string
    labels?: { name: string }
    mouseover?: string
  }[]
}

function firstField(value: unknown) {
  return typeof value === 'string' ? value.split(',')[0]! : undefined
}

function escapeJexlString(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// Converts a UCSC trackDb `mouseOver` template (e.g. "<b>AF</b>: ${AF} ($ref)")
// into a JBrowse jexl string that concatenates literal text with feature field
// lookups. Both $field and ${field} forms are supported.
export function mouseOverTemplateToJexl(template: string) {
  const parts: string[] = []
  let last = 0
  for (const m of template.matchAll(/\$\{(\w+)\}|\$(\w+)/g)) {
    const idx = m.index
    if (idx > last) {
      parts.push(`'${escapeJexlString(template.slice(last, idx))}'`)
    }
    parts.push(`get(feature,'${m[1] ?? m[2] ?? ''}')`)
    last = idx + m[0].length
  }
  if (last < template.length) {
    parts.push(`'${escapeJexlString(template.slice(last))}'`)
  }
  return parts.length > 0 ? `jexl:${parts.join('+')}` : undefined
}

export function getUcscFeatureDisplay(
  trackId: string,
  ucsc: Record<string, unknown>,
): Partial<FeatureDisplay> {
  const labelField =
    firstField(ucsc.defaultLabelFields) ?? firstField(ucsc.labelFields)
  const labels =
    labelField !== undefined
      ? {
          name:
            labelField === 'none'
              ? "jexl:''"
              : `jexl:get(feature,'${labelField}')`,
        }
      : undefined

  // A `mouseOver` template gives richer tooltips than the single mouseOverField,
  // so prefer it when UCSC provides one
  const mouseoverTemplate =
    typeof ucsc.mouseOver === 'string'
      ? mouseOverTemplateToJexl(ucsc.mouseOver)
      : undefined
  const mouseoverField =
    typeof ucsc.mouseOverField === 'string'
      ? `jexl:get(feature,'${ucsc.mouseOverField}')`
      : undefined
  const mouseover = mouseoverTemplate ?? mouseoverField

  return labels !== undefined || mouseover !== undefined
    ? {
        displays: [
          {
            type: 'LinearBasicDisplay',
            displayId: `${trackId}-LinearBasicDisplay`,
            ...(labels !== undefined ? { labels } : {}),
            ...(mouseover !== undefined ? { mouseover } : {}),
          },
        ],
      }
    : {}
}
