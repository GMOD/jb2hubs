import { checkIfFileAccessible } from './checkIfFileAccessible.ts'
import { resolveBigDataUri } from './resolveBigDataUri.ts'
import { resolveSpeciesTreeUri } from './resolveSpeciesTree.ts'

/**
 * Turn an optional trackDb sidecar setting into a url the config can name, or
 * undefined. A sidecar path is relative to hgdownload's root when it doesn't
 * name a host — cactus241way's summary is `/gbdb/hg38/...` while multiz470way's
 * is a full `https://hgdownload...` url, and both appear in the same trackDb.
 *
 * An unreachable one is dropped rather than left pointing at a 404, because a
 * sidecar is load-bearing when present: a `summaryAdapter` that 404s fails the
 * fetch at exactly the zoom the summary exists to make cheap, which is worse
 * than not having the tier at all. Same reachability gate the alignment itself
 * goes through, so it is a no-op unless CHECK_404 is set (make.sh sets it).
 */
async function resolveSidecar({
  path,
  baseUrl,
  assembly,
  trackName,
}: {
  path: string | undefined
  baseUrl: string
  assembly: string
  trackName: string
}) {
  if (!path) {
    return undefined
  }
  const url = resolveBigDataUri({ bigDataUrl: path, baseUrl })
  return (await checkIfFileAccessible({ url, assembly, trackName }))
    ? url
    : undefined
}

function parseSpeciesString(str: string) {
  const regex = /(\w+)="([^"]+)"/g
  const result = []
  let match

  while ((match = regex.exec(str)) !== null) {
    result.push({
      id: match[1],
      label: match[2] ?? match[1],
    })
  }

  return result
}

/**
 * The `type bigMaf` branch of the big-file walk, as its own module so it can be
 * tested — `mergeBigFileTracks.ts` parses argv and exits at import, so nothing
 * defined inside it is reachable from a test.
 *
 * UCSC ships two sidecars beside a multiz/cactus alignment and names them in the
 * same trackDb stanza as the alignment. Both slots are optional on the adapter,
 * and leaving them off is not cosmetic on a deep alignment:
 *
 * - `summary` (bigMafSummary.bb) is the zoom-reduced tier `LinearMafDisplay`
 *   swaps to past 20kb. Without it a 470-way has no cheap path at any zoom, so
 *   the whole zoomed-out range is a force-load prompt — and force-load is a
 *   track-wide, session-long approval, so one click there commits the user to
 *   downloading the full alignment everywhere they navigate afterwards.
 * - `frames` (mafFrames.bb) is the per-species CDS reading frames; the codon
 *   view and codon conservation have nothing to draw without it.
 *
 * `hubtools`' `createTrackConfiguration` already does this for the hub path;
 * this is the golden-path twin, which had only ever wired `bigBedLocation`.
 *
 * The third sidecar, the newick species tree behind `nhLocation`, is the one no
 * trackDb names, so `resolveSpeciesTree.ts` discovers it on hgdownload instead
 * — and says why that takes a directory listing rather than a filename
 * template. It is golden-path only, and that is a finding rather than an
 * omission: measured 2026-08-27, **no hub publishes a tree at all**. All three
 * hub MAF families were listed on hgdownload and none has a `.nh` anywhere
 * beneath it — VGP's `vgp577way` (21 GenArk hubs, `/hubs/VGP/vgp577way/` holds
 * `bbi/` and `maf/` and nothing else), `mouseStrains` (16 hubs), and the Lowe
 * lab's archaeal `contrib/lowelab/multiz.bb` (18 hubs). Their hub.txt stanzas
 * name `summary`, `frames` and `speciesOrder` and never a tree; hgTracks draws
 * the hub-side tree from `treeImage`, a PNG. So probing per MAF track in the
 * genark pipeline would spend requests to learn nothing, 55 times over.
 */
export async function buildBigMafTrack({
  trackId,
  tableName,
  assemblyName,
  uri,
  baseUrl,
  settings,
}: {
  trackId: string
  tableName: string
  assemblyName: string
  uri: string
  baseUrl: string
  settings: {
    longLabel?: string
    speciesLabels?: string
    summary?: string
    frames?: string
  }
}) {
  const trackName = settings.longLabel ?? tableName
  const [[summaryUri, framesUri], nhUri] = await Promise.all([
    Promise.all(
      [settings.summary, settings.frames].map(path =>
        resolveSidecar({ path, baseUrl, assembly: assemblyName, trackName }),
      ),
    ),
    resolveSpeciesTreeUri({ alignmentUri: uri }),
  ])
  return {
    trackId,
    name: tableName,
    type: 'MafTrack',
    assemblyNames: [assemblyName],
    adapter: {
      type: 'BigMafAdapter',
      samples: settings.speciesLabels
        ? parseSpeciesString(settings.speciesLabels)
        : [],
      bigBedLocation: { uri },
      ...(nhUri ? { nhLocation: { uri: nhUri } } : {}),
      ...(summaryUri
        ? {
            summaryAdapter: {
              type: 'BigBedAdapter',
              bigBedLocation: { uri: summaryUri },
            },
          }
        : {}),
      ...(framesUri
        ? {
            annotationAdapter: {
              type: 'BigBedAdapter',
              bigBedLocation: { uri: framesUri },
            },
          }
        : {}),
    },
  }
}
