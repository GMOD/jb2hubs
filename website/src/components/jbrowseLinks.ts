// Shared JBrowse launch-URL builders. A launch URL is a hosted config plus a
// one-time `spec-` session that the LaunchView extension expands into real views
// on load. Used by every "open in JBrowse" path (multi-synteny drill-downs, the
// pangenome explorer, the ortholog results table) so the encoding lives once.

import { JBROWSE_BASE } from '../config/jbrowse.ts'

const MERGE_API = 'https://0hifvzakej.execute-api.us-east-1.amazonaws.com/merge'

// config + spec session of one or more views. `sessionTracks` carries full track
// configs that aren't in the hosted config — loadSessionSpec adds them via
// session.addTrackConf, so a view's `tracks` can reference their trackIds. This is
// how we attach data (e.g. the HPRC VCF on public S3) without first baking it into
// the served config.
export function specUrl(
  config: string,
  views: object[],
  sessionTracks?: object[],
) {
  const session = JSON.stringify(
    sessionTracks?.length ? { views, sessionTracks } : { views },
  )
  return `${JBROWSE_BASE}/?config=${encodeURIComponent(config)}&session=spec-${encodeURIComponent(session)}`
}

// A launch url wrapped as the jbrowse:// link that opens it in an installed
// JBrowse Desktop (5.0+, which is where the handler lands). The whole url is
// carried as one encoded parameter rather than by copying its query, so a config
// named relatively still resolves against the web instance the link points at.
//
// Mirrors Desktop's own `toProtocolUrl`
// (products/jbrowse-desktop/electron/launchTarget.ts). The two are separate
// repos and cannot share the function, so `desktopLinks.test.ts` asserts the
// property that matters: the wrapper round-trips the exact url back out.
export function desktopUrl(webUrl: string) {
  return `jbrowse://open?url=${encodeURIComponent(webUrl)}`
}

// The merge API stitches several hosted hubs into one config.
export const mergeConfig = (hubIds: string[]) =>
  `${MERGE_API}?hubIds=${hubIds.join(',')}`

// One genome panel in a stacked LinearSyntenyView, optionally pre-navigated and
// carrying the tracks it opens. A sub-view gets no defaultSession of its own, so
// a panel launched with no `tracks` is an empty browser at the right locus.
export interface SyntenySubView {
  assembly: string
  loc?: string
  tracks?: string[]
}

// The `tracks` field for one panel, or nothing at all when the catalog resolved
// no gene track for that genome — an absent field and an empty array launch the
// same, and omitting it keeps the spec the shape older hosts already read.
export function panelTracks(trackId: string) {
  return trackId ? { tracks: [trackId] } : {}
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
