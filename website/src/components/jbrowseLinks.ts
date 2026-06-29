// Shared JBrowse launch-URL builders. A launch URL is a hosted config plus a
// one-time `spec-` session that the LaunchView extension expands into real views
// on load. Used by every "open in JBrowse" path (multi-synteny drill-downs, the
// pangenome explorer, the ortholog results table) so the encoding lives once.

const JBROWSE = 'https://jbrowse.org/code/jb2/main'
const MERGE_API = 'https://0hifvzakej.execute-api.us-east-1.amazonaws.com/merge'

// config + spec session of one or more views.
export function specUrl(config: string, views: object[]) {
  const session = JSON.stringify({ views })
  return `${JBROWSE}/?config=${encodeURIComponent(config)}&session=spec-${encodeURIComponent(session)}`
}

// The merge API stitches several hosted hubs into one config.
export const mergeConfig = (hubIds: string[]) =>
  `${MERGE_API}?hubIds=${hubIds.join(',')}`

// One genome panel in a stacked LinearSyntenyView, optionally pre-navigated.
export interface SyntenySubView {
  assembly: string
  loc?: string
}

// LaunchView init options the LinearSyntenyView reads on first load; builds that
// predate any of them just ignore the extra field.
export interface SyntenyViewOptions {
  colorBy?: string
  drawCurves?: boolean
  autoDiagonalize?: boolean
}

// A launch URL for a LinearSyntenyView over a stack of genome panels. `tracks`
// is either a flat list (JBrowse binds each track to its level by matching
// assemblyNames) or one array per level. The whole-genome merge config is built
// from the panels' assemblies. Single source for every synteny-view launch.
export function syntenyViewUrl(
  views: SyntenySubView[],
  tracks: (string | string[])[],
  options: SyntenyViewOptions = {},
) {
  return specUrl(mergeConfig(views.map(v => v.assembly)), [
    { type: 'LinearSyntenyView', views, tracks, ...options },
  ])
}
