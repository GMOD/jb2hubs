/**
 * Turn a trackDb `bigDataUrl` (or a bigMaf `summary`/`frames` sidecar) into a
 * url the config can name.
 *
 * A trackDb spells these three ways, and hg38's alone uses all three:
 *
 *   ncbiRefSeq.bb                          relative to the assembly's dir
 *   /gbdb/hg38/gnomAD/v4.1/genomes/…       absolute on hgdownload
 *   https://hgdownload-test.gi.ucsc.edu/…  absolute on some OTHER host
 *
 * Only the third is interesting, and it is why this is a function rather than a
 * concat at each call site. `mergeBigFileTracks` used to ask
 * `bigDataUrl.startsWith(baseUrl)` -- true for hgdownload's own urls, false for
 * a full url anywhere else -- and then prefixed the base onto it anyway, so
 * hg38's cactus447way shipped for months as
 *
 *   https://hgdownload.soe.ucsc.eduhttps://hgdownload-test.gi.ucsc.edu/…
 *
 * which resolves to nothing. `buildBigMafTrack` had the same rule written
 * correctly a few files away, which is the argument for one copy: the test that
 * pins it now covers both callers.
 *
 * "Absolute" is a scheme, not a known host. UCSC moves files between
 * hgdownload, hgdownload2 and hgdownload-test, and a list of hosts to trust
 * would go stale the first time they add one.
 *
 * The non-url case is joined as a bare concat because every one that occurs
 * starts with `/`: a golden-path trackDb writes root-absolute paths, and
 * resolveTableBigFile returns full urls. A path relative to the assembly's own
 * directory would need the assembly in it to resolve, and no caller has one to
 * give -- so rather than invent a base for a shape that does not arrive, this
 * lets it through unchanged for checkTrackUrls.mjs to report.
 */
export function resolveBigDataUri({
  bigDataUrl,
  baseUrl,
}: {
  bigDataUrl: string
  baseUrl: string
}) {
  return /^https?:\/\//.test(bigDataUrl)
    ? bigDataUrl
    : `${baseUrl}${bigDataUrl}`
}
