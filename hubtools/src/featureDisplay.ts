// Derives a JBrowse LinearBasicDisplay from the UCSC trackDb label/mouseover/
// filter settings that ride along in a track's metadata.ucsc. Targets the
// current (canvas) config shape where `labels` and `mouseover` sit directly on
// the display rather than under a renderer.

export interface FeatureDisplay {
  displays: {
    type: string
    displayId: string
    labels?: { name: string }
    mouseover?: string
    jexlFilters?: string[]
  }[]
}

export function firstField(value: unknown) {
  return typeof value === 'string' ? value.split(',')[0]! : undefined
}

// Escapes literal text destined for the static portion of a jexl template
// literal (backtick-delimited, ${...} interpolation): backslash and backtick so
// the text can't terminate the template, and $ so stray label text like "${" is
// never read as an interpolation. jexl's _unescapeTemplateString reverses these.
function escapeTemplateStatic(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$&')
}

// The BED/BigBed adapter consumes the three standard positional columns and
// re-emits them under JBrowse names, so a template referencing the UCSC names
// resolves to nothing (the "undefined:undefined-undefined" tooltips). Extra
// autoSql columns keep their own names and need no mapping.
const featureFieldRenames: Record<string, string> = {
  chrom: 'refName',
  chromStart: 'start',
  chromEnd: 'end',
}

export function toFeatureField(field: string) {
  return featureFieldRenames[field] ?? field
}

// Converts a UCSC trackDb `mouseOver` template (e.g. "<b>AF</b>: ${AF} ($ref)")
// into a jexl template literal, mapping both $field and ${field} to
// ${get(feature,'field')}. A jexl template literal renders a missing/null field
// as '' (and preserves 0), matching UCSC — unlike the old string concatenation,
// which emitted the literal text "undefined" for absent fields.
export function mouseOverTemplateToJexl(template: string) {
  let out = ''
  let last = 0
  for (const m of template.matchAll(/\$\{(\w+)\}|\$(\w+)/g)) {
    const idx = m.index
    out += escapeTemplateStatic(template.slice(last, idx))
    out += `\${get(feature,'${toFeatureField(m[1] ?? m[2]!)}')}`
    last = idx + m[0].length
  }
  out += escapeTemplateStatic(template.slice(last))
  return out ? `jexl:\`${out}\`` : undefined
}

// JBrowse's own `jexlFilters` default, which SETTING the slot replaces. It hides
// the NCBI whole-sequence source record (one type=region feature spanning the
// molecule, always gbkey=Src) and is a no-op on a bigBed, which has no gbkey --
// but a GenArk hub's NCBI RefSeq GFF track is a FeatureTrack with a trackDb
// entry like any other, so a derived filter that dropped this would put the
// source record back on exactly those tracks. Transcribed rather than imported
// because these configs are consumed by a released JBrowse, not built against
// one; if the default changes there, this goes stale in the safe direction (one
// redundant term).
const JBROWSE_DEFAULT_FILTER = "get(feature,'gbkey')!='Src'"

// A trackDb filter value: `400`, or a `lo:hi` range.
function parseFilterRange(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }
  const parts = value.split(':')
  if (parts.length > 2) {
    return undefined
  }
  const nums = parts.map(Number)
  return nums.every(n => Number.isFinite(n))
    ? { lo: nums[0]!, hi: parts.length === 2 ? nums[1]! : undefined }
    : undefined
}

/**
 * The jexl filters implied by a track's UCSC trackDb `filter.<field>` defaults.
 *
 * UCSC's browser applies these before drawing and JBrowse has no idea they
 * exist, so a track whose trackDb hides most of its own file arrives here
 * drawing all of it. JASPAR is the case that shows what that costs: its file
 * carries every motif match, `filter.score 400` is what makes the UCSC track a
 * readable set of boxes, and without it a promoter is a solid field. The
 * canvas display's density gate measures the ADMITTED population (both the
 * pre-fetch sample and the exact count take the same admission predicate), so a
 * filter that lands here is also what keeps such a track under the gate instead
 * of behind a force-load prompt.
 *
 * Deliberately narrow, because the cost of a wrong filter is invisible -- a
 * feature that silently never draws. Three conditions, all of which JASPAR and
 * the recount3 junction tracks meet and the ~60 other filter-carrying hg38
 * tracks mostly do not:
 *
 * - `filterByRange.<field>` is set, i.e. UCSC's own UI treats the field as a
 *   numeric range. That is the only evidence available here that the field
 *   exists on every feature -- a missing field makes `get(feature,'x') >= n`
 *   false, so an absent column would hide the whole track.
 * - the value differs from `filterLimits.<field>`. Most of these defaults sit at
 *   the full range of the data (the hub generator writes the observed min:max),
 *   which is a filter that filters nothing.
 * - with no `filterLimits` to compare against, only a scalar is used, and only a
 *   non-zero one. A bare range with no limits is the auto-generated data range
 *   again, and there is nothing here to tell it from a real cutoff.
 *
 * `filterValues.<field>` fields are skipped outright: those are categorical
 * multi-selects whose value is a vocabulary rather than a threshold.
 */
export function ucscDefaultFilters(ucsc: Record<string, unknown>) {
  const filters: string[] = []
  for (const [key, value] of Object.entries(ucsc)) {
    if (!key.startsWith('filter.')) {
      continue
    }
    const field = key.slice('filter.'.length)
    if (
      ucsc[`filterByRange.${field}`] === undefined ||
      ucsc[`filterValues.${field}`] !== undefined
    ) {
      continue
    }
    const range = parseFilterRange(value)
    const limits = parseFilterRange(ucsc[`filterLimits.${field}`])
    if (!range) {
      continue
    }
    const get = `get(feature,'${toFeatureField(field)}')`
    if (limits) {
      if (range.lo > limits.lo) {
        filters.push(`${get} >= ${range.lo}`)
      }
      if (
        range.hi !== undefined &&
        limits.hi !== undefined &&
        range.hi < limits.hi
      ) {
        filters.push(`${get} <= ${range.hi}`)
      }
    } else if (range.hi === undefined && range.lo !== 0) {
      filters.push(`${get} >= ${range.lo}`)
    }
  }
  return filters
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
              : `jexl:get(feature,'${toFeatureField(labelField)}')`,
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
      ? `jexl:get(feature,'${toFeatureField(ucsc.mouseOverField)}')`
      : undefined
  const mouseover = mouseoverTemplate ?? mouseoverField

  const derivedFilters = ucscDefaultFilters(ucsc)
  // Setting the slot replaces JBrowse's default, so the default rides along
  // rather than being dropped -- see JBROWSE_DEFAULT_FILTER. Left undefined when
  // nothing was derived, so a track with no trackDb filter keeps whatever the
  // running JBrowse ships rather than being pinned to today's copy of it.
  const jexlFilters =
    derivedFilters.length > 0
      ? [JBROWSE_DEFAULT_FILTER, ...derivedFilters]
      : undefined

  return labels !== undefined || mouseover !== undefined || jexlFilters
    ? {
        displays: [
          {
            type: 'LinearBasicDisplay',
            displayId: `${trackId}-LinearBasicDisplay`,
            ...(labels !== undefined ? { labels } : {}),
            ...(mouseover !== undefined ? { mouseover } : {}),
            ...(jexlFilters ? { jexlFilters } : {}),
          },
        ],
      }
    : {}
}
