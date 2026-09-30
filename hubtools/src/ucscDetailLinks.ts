import { toFeatureField, ucscHiddenDetailFields } from './featureDisplay.ts'

// Where a UCSC `hgTracks?db=…&position=…` link goes instead: a
// genomes.jbrowse.org page that reads the same query and launches JBrowse on
// our config for that db.
export const UCSC_LAUNCH_URL = 'https://genomes.jbrowse.org/ucsc/launch/'

const UCSC_ORIGIN = 'https://genome.ucsc.edu/'

// Columns holding html links relative to UCSC's own /cgi-bin/, by trackDb track
// name. In a JBrowse feature-details panel such a link resolves against the
// app's page, so NCBI Orthologs' links to a gene's orthologs in the other four
// assemblies carrying the track all landed on
// jbrowse.org/code/jb2/main/hgTracks?db=…, which serves nothing. The converter
// cannot see a bigBed's columns without fetching it, hence a list.
const RELATIVE_HGTRACKS_COLUMNS: Record<string, string[]> = {
  ncbiOrtho: ['url'],
}

// The adapters whose features carry UCSC's item name as `name` and its columns
// under their own names. A genePred table converted to GFF3 names the gene and
// the transcript differently, and `$$` means the transcript, so those (38
// tracks, all on legacy assemblies) are left without links.
const LINKED_ADAPTERS = new Set(['BigBedAdapter', 'BedTabixAdapter'])

function lit(s: string) {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * A trackDb url template made absolute. UCSC resolves a relative one against
 * its own /cgi-bin/; an hgTracks link goes to UCSC_LAUNCH_URL instead, naming
 * the db when the template left it to the page it was on.
 */
export function absoluteUcscTemplate(template: string) {
  if (/^([a-z][\w+.-]*:|\/\/|\$)/i.test(template)) {
    return template
  }
  const path = template.replace(/^(\.\.\/|\/)+/, '')
  const cgi = path.replace(/^cgi-bin\//, '')
  if (cgi.startsWith('hgTracks?')) {
    const query = cgi.slice('hgTracks?'.length)
    return `${UCSC_LAUNCH_URL}?${/(^|&)db=/.test(query) ? query : `db=$D&${query}`}`
  }
  return cgi !== path || /^hg\w*(\?|$)/.test(path)
    ? `${UCSC_ORIGIN}cgi-bin/${cgi}`
    : `${UCSC_ORIGIN}${path}`
}

interface TemplateContext {
  db: string
  track: string
  // the jexl for `$$`: the item name for `url`, one column's value for `urls`
  id: string
  idGuard?: string
  // whether `$<column>` is substituted, which hgc does for `url` only
  columns: boolean
}

/**
 * A url template as a jexl string expression, with the feature fields it reads
 * (each must be present for the link to be written), or undefined for a
 * template naming a variable a feature cannot supply. The variables are
 * replaceInUrl's, in kent's src/hg/lib/hui.c: `$[`/`$]` are hgc's window, which
 * is the item's own extent when an item is clicked, so they read the feature
 * as `${`/`$}` do.
 */
export function ucscTemplateJexl(template: string, ctx: TemplateContext) {
  const parts: string[] = []
  const guards = new Set<string>()
  const needId = () => {
    if (ctx.idGuard) {
      guards.add(ctx.idGuard)
    }
    return ctx.id
  }
  const variable = (name: string, column: string | undefined) => {
    switch (name) {
      case '$':
        return needId()
      case 'T':
        return lit(ctx.track)
      case 'D':
        return lit(ctx.db)
      case 'S':
        guards.add('feature.refName')
        return 'feature.refName'
      case 's':
        guards.add('feature.refName')
        return "(startsWith(feature.refName,'chr')?substring(feature.refName,3):feature.refName)"
      case '[':
      case '{':
        return 'feature.start'
      case ']':
      case '}':
        return 'feature.end'
      case '#':
        return '(feature.start+1)'
      case 'P':
        return `split(${needId()},':')[0]`
      case 'p': {
        const id = needId()
        return `(split(${id},':')[1]?split(${id},':')[1]:${id})`
      }
      default: {
        if (!ctx.columns || !column || !/^[A-Za-z_]\w*$/.test(column)) {
          return undefined
        }
        const field = `feature.${toFeatureField(column)}`
        guards.add(field)
        return field
      }
    }
  }
  let last = 0
  for (const m of template.matchAll(/\$(\$|<(\w+)>|taxId|[TSsDPpn#[\]{}])/g)) {
    parts.push(lit(template.slice(last, m.index).replace(/"/g, '%22')))
    const value = variable(m[1]!, m[2])
    if (value === undefined) {
      return undefined
    }
    parts.push(value)
    last = m.index + m[0].length
  }
  parts.push(lit(template.slice(last).replace(/"/g, '%22')))
  return {
    expr: parts.filter(p => p !== "''").join('+') || "''",
    guards: [...guards],
  }
}

function anchor(href: string, text: string) {
  return `'<a href="'+${href}+'">'+${text}+'</a>'`
}

function guarded(guards: string[], then: string, otherwise: string) {
  return guards.length > 0 ? `${guards.join('&&')}?${then}:${otherwise}` : then
}

/**
 * trackDb `url`, as hgc's printCustomUrlWithLabel shows it: a row named by
 * `urlLabel` whose value is the item name linked through the template, or the
 * label itself linked when the template does not use the name.
 */
function urlEntry(ucsc: Record<string, unknown>, db: string, track: string) {
  if (typeof ucsc.url !== 'string' || !ucsc.url) {
    return undefined
  }
  const label =
    typeof ucsc.urlLabel === 'string'
      ? ucsc.urlLabel.trim().replace(/:$/, '').trim()
      : ''
  const key = label || 'Outside Link'
  const t = ucscTemplateJexl(absoluteUcscTemplate(ucsc.url), {
    db,
    track,
    id: "(''+feature.name)",
    idGuard: 'feature.name',
    columns: true,
  })
  if (!t) {
    return undefined
  }
  const text = ucsc.url.includes('$$') ? "(''+feature.name)" : lit(key)
  return `${lit(key)}:${guarded(t.guards, anchor(t.expr, text), 'undefined')}`
}

export function parseUcscUrls(setting: string) {
  return [...setting.matchAll(/(\w+)=(?:"([^"]*)"|(\S+))/g)].map(
    m => [m[1]!, m[2] ?? m[3]!] as const,
  )
}

/**
 * trackDb `urls`, one `column="template"` per linked column, as hgc's
 * printIdOrLinks shows them: the value linked, `$$` being the part before a
 * `|` and the link text the part after. hgc also splits a comma list into one
 * link per id, which a jexl callback cannot, having no map; a list is left as
 * the text it was. Measured over 29 hg38 tracks on 2026-09-30, that leaves
 * PubMed lists (`pmids`, `publications`, `pubmedIds`) and ENCODE's cCRE and
 * experiment lists unlinked, and links every single id.
 */
function urlsEntries(ucsc: Record<string, unknown>, db: string, track: string) {
  if (typeof ucsc.urls !== 'string') {
    return []
  }
  return parseUcscUrls(ucsc.urls).flatMap(([column, template]) => {
    if (!/^[A-Za-z_]\w*$/.test(column)) {
      return []
    }
    const value = `feature.${toFeatureField(column)}`
    const s = `(''+${value})`
    const t = ucscTemplateJexl(absoluteUcscTemplate(template), {
      db,
      track,
      id: `split(${s},'|')[0]`,
      columns: false,
    })
    if (!t) {
      return []
    }
    const text = `(split(${s},'|')[1]?split(${s},'|')[1]:${s})`
    const single = [`replaceAll(${s},',','')==${s}`, ...t.guards]
    return [
      `${lit(column)}:${value}?(${guarded(single, anchor(t.expr, text), value)}):${value}`,
    ]
  })
}

/**
 * The `formatDetails` for a UCSC track, or undefined when it needs none. A
 * jexl callback returning `undefined` for a key removes that row (see
 * FormatDetails in the JBrowse config docs); any other value replaces it.
 *
 * The panel evaluates it against the feature as a plain object, so a column is
 * `feature.<name>`: `get(feature,…)` throws there, and a throwing callback
 * replaces the whole panel with an error. A column can also arrive as a number,
 * which is why every string function here reads `''+feature.<name>`.
 *
 * It hides ucscHiddenDetailFields, points relative `hgTracks?` links inside a
 * column at UCSC_LAUNCH_URL, and, given the db, turns the trackDb `url` and
 * `urls` settings into links. Those go on the transcripts of a track the
 * adapter groups into genes, since the columns and UCSC's item name are
 * theirs, not the synthesized gene's.
 */
export function ucscFormatDetails(
  ucsc: Record<string, unknown>,
  adapter: Record<string, unknown> | undefined,
  db?: string,
) {
  const track = String(ucsc.track)
  const top = [
    ...ucscHiddenDetailFields(ucsc).map(f => `${f}:undefined`),
    ...(RELATIVE_HGTRACKS_COLUMNS[track] ?? []).map(
      f =>
        `${f}:feature.${f}?replaceAll(feature.${f},'href="hgTracks?','href="${UCSC_LAUNCH_URL}?'):feature.${f}`,
    ),
  ]
  const links =
    db !== undefined && LINKED_ADAPTERS.has(String(adapter?.type))
      ? [urlEntry(ucsc, db, track), ...urlsEntries(ucsc, db, track)].filter(
          e => e !== undefined,
        )
      : []
  const onTranscripts = adapter?.aggregateField !== undefined
  const feature = onTranscripts ? top : [...top, ...links]
  const subfeatures = onTranscripts ? links : []
  const formatDetails = {
    ...(feature.length > 0 ? { feature: `jexl:{${feature.join(',')}}` } : {}),
    ...(subfeatures.length > 0
      ? { subfeatures: `jexl:{${subfeatures.join(',')}}` }
      : {}),
  }
  return Object.keys(formatDetails).length > 0 ? formatDetails : undefined
}
