// Imported by scripts/checkTrackUrls.mjs as well as the build, so the gate
// reads the link the way the build writes it. Keep it free of imports.

/** The directory beside a config that holds its tracks' description pages. */
export const DESCRIPTIONS = 'descriptions'
const LINK_START = '<a href="https://jbrowse.org/ucsc/'
const LINK_END = '">Track description</a>'

export function descriptionFile(track: string) {
  return `${encodeURIComponent(track)}.html`
}

/**
 * `metadata.ucsc.html` for a track with trackDb prose: a lone anchor to the
 * page writeTrackDescriptions puts beside the config, the shape a hub's own
 * description link has. JBrowse fetches it into the About dialog's Description
 * card, and reads it as a page only when the href is absolute, so the staging
 * and minimal configs name the one production copy.
 */
export function descriptionAnchor(db: string, track: string) {
  return `${LINK_START}${encodeURIComponent(db)}/${DESCRIPTIONS}/${encodeURIComponent(descriptionFile(track))}${LINK_END}`
}

/**
 * The page a `metadata.ucsc.html` written by descriptionAnchor links: the db
 * whose directory holds it and its path there. Undefined for anything else,
 * such as a hub's link to its own page.
 */
export function linkedDescription(html: unknown) {
  const [db, dir, file, ...deeper] =
    typeof html === 'string' &&
    html.startsWith(LINK_START) &&
    html.endsWith(LINK_END)
      ? html.slice(LINK_START.length, -LINK_END.length).split('/')
      : []
  return db && dir === DESCRIPTIONS && file && deeper.length === 0
    ? {
        db: decodeURIComponent(db),
        path: `${DESCRIPTIONS}/${decodeURIComponent(file)}`,
      }
    : undefined
}
