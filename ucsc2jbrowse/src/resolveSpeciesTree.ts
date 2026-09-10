/**
 * Find the newick species tree UCSC ships beside a golden-path multiple
 * alignment, so `MafTrack` gets a tree sidebar without a hand-written mixin
 * entry per assembly.
 *
 * The trackDb does NOT name it. Measured 2026-08-27 against
 * `api.genome.ucsc.edu/list/tracks?genome=hg38`: the three real `bigMaf`
 * stanzas carry `summary`, `frames` and `treeImage` (a PNG for hgTracks), and
 * `.nh` appears nowhere in hg38's whole `trackDb.txt.gz`. So the tree has to be
 * discovered on hgdownload rather than read out of a setting.
 *
 * There is no filename template either. The one directory listing of the
 * alignment's own directory is what settles it — these are all real, from
 * hgdownload on 2026-08-27:
 *
 *   hg38/multiz470way    hg38.470way.nh          + commonNames, scientificNames
 *   hg38/cactus447way    hg38.447way.nh.txt      + commonNames, scientificNames
 *   hg38/cactus241way    hg38.cactus241way.nh    + scientificNames
 *   hg19/multiz46way     46way.nh                + 46way.corrected, commonNames.*
 *   hg19/multiz100way    hg19.100way.nh
 *   mm39/multiz35way     mm39.35way.nh
 *   mm10/multiz60way     mm10.60way.nh           + commonNames
 *   ce11/multiz135way    ce11.135way.nh          + scientificName, taxId
 *   dm6/multiz124way     dm6.124way.sequenceNames.nh  (no plain `.nh` at all)
 *   sacCer3/multiz7way   7way.nh
 *   galGal6/multiz77way  galGal6.77way.nh
 *
 * Four things vary independently — whether the db prefixes the name, whether
 * the aligner prefixes the way-count, whether the extension is `.nh` or
 * `.nh.txt`, and whether the plain spelling exists at all. Guessing a template
 * would have produced a 404 for hg19's `46way.nh` and for dm6 outright, and an
 * `nhLocation` naming a 404 is worse than no tree: the display would fetch it
 * every time the sidebar opens and show nothing.
 *
 * `pickSpeciesTreeFile` is the rule the listing feeds. UCSC publishes the same
 * topology under several leaf vocabularies and only one of them uses the ids the
 * MAF's `s` lines carry — `hg38`, `HLnomLeu4`, `droSim2` — which is also the
 * vocabulary `speciesOrder`/`speciesLabels` and therefore the adapter's
 * `samples` use. Verified by fetching the trees: `hg38.470way.nh` opens
 * `((((((((((((((((hg38:0.005962,(panPan3:...`, while the sibling
 * `scientificNames` copy spells the same leaves `Homo_sapiens`. So drop the
 * vocabulary variants by name and take the shortest of what is left, which
 * lands on the plain spelling where there is one and on dm6's `sequenceNames`
 * where there is not.
 */

/**
 * Only a directory whose own name ends in `<digits>way` is an alignment
 * directory. Everything else a `bigMaf` can point at is a chainNet subtrack —
 * hs1 alone has 27, under `/gbdb/hs1/chainNet/`, and hgdownload's autoindex of
 * a shared `bbi/` or `chainNet/` directory is thousands of entries that cannot
 * contain a species tree because a pairwise net has no species to build one
 * from. The gate is what keeps the cost at one small request per real
 * alignment.
 */
import { HttpError, myfetchtextWithRetry } from 'hubtools'

const ALIGNMENT_DIR = /\d+way$/

const OTHER_VOCABULARY = /commonname|scientificname|taxid/i

export function pickSpeciesTreeFile(names: string[]) {
  return names
    .filter(name => /\.nh(\.txt)?$/i.test(name))
    .filter(name => !OTHER_VOCABULARY.test(name))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .at(0)
}

/**
 * Read an hgdownload autoindex into the filenames it lists. An href with a `/`
 * or a `:` in it is a subdirectory, a parent link or a sort control, and a
 * directory UCSC has given its own `index.html` (`/hubs/`, `/hubs/VGP/`) has
 * none of the shape below at all — it returns an empty list rather than the
 * navigation chrome of the page.
 */
function parseAutoindex(html: string) {
  return [...html.matchAll(/href="([^"]+)"/g)]
    .map(match => match[1]!)
    .filter(href => !href.includes('/') && !href.includes(':'))
    .filter(href => !href.startsWith('?') && !href.startsWith('#'))
}

// Read through myfetchtextWithRetry, like every other hgdownload read in this
// pipeline, rather than through a bare fetch. That is three rounds and the
// hgdownload2 mirror on each, and it matters because a transient failure here
// is not neutral: the config is rebuilt from scratch every run and written
// whenever its text changed, so one unanswered listing DELETES the track's
// nhLocation from the published config. On 2026-09-09 exactly that happened --
// `TypeError: fetch failed` on hg38/multiz470way -- and the only reason no
// config moved is that hg38's two trees are also pinned by hand in
// ucscMixins/hg38.json, which is a backstop for two of the seven bigMaf tracks
// in the corpus and none of the rest.
//
// The 404-vs-transient split stays, and is now also what stops the retry: a
// directory upstream does not publish answers the same way three times.
//
// Two rounds rather than the default three, because the consequences are not
// the same size. A hub.txt that loses every attempt fails the whole config
// build, which is why buildConfigs.ts spends the full budget on it; losing a
// species tree costs one MafTrack its sidebar. Two rounds over both hosts is
// four chances in two seconds, against a host this repo is deliberately gentle
// with -- and it is three more than the single attempt that dropped the tree.
const LISTING_ATTEMPTS = 2

async function listUcscDirectory(dirUrl: string) {
  try {
    return parseAutoindex(
      await myfetchtextWithRetry(`${dirUrl}/`, LISTING_ATTEMPTS),
    )
  } catch (error) {
    // "UCSC publishes no tree for this alignment" and "hgdownload was down"
    // look identical in the config, so say which happened.
    if (
      error instanceof HttpError &&
      (error.status === 404 || error.status === 410)
    ) {
      console.error(
        `No alignment directory listing (${error.status}): ${dirUrl}`,
      )
    } else {
      console.error(
        `Could not list the alignment directory, no species tree this run: ${dirUrl} (${error})`,
      )
    }
    return undefined
  }
}

/**
 * The url of the species tree beside `alignmentUri`, or undefined.
 *
 * A no-op unless CHECK_404 is set (make.sh sets it), the same gate
 * `checkIfFileAccessible` uses and for the same reason: this one needs the
 * network, and the unit tests exercise their callers without it.
 */
export async function resolveSpeciesTreeUri({
  alignmentUri,
}: {
  alignmentUri: string
}) {
  if (!process.env.CHECK_404) {
    return undefined
  }
  const dirUrl = alignmentUri.slice(0, alignmentUri.lastIndexOf('/'))
  if (!ALIGNMENT_DIR.test(dirUrl.slice(dirUrl.lastIndexOf('/') + 1))) {
    return undefined
  }
  // No try/catch here any more: listUcscDirectory owns every failure, and
  // reports which kind it was. A second catch could only say less.
  const names = await listUcscDirectory(dirUrl)
  const file = names ? pickSpeciesTreeFile(names) : undefined
  return file ? `${dirUrl}/${file}` : undefined
}
