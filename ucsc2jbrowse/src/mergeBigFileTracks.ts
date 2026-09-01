import { dedupe, firstField } from 'hubtools'

import { buildBigMafTrack } from './buildBigMafTrack.ts'
import { checkIfFileAccessible } from './checkIfFileAccessible.ts'
import { buildMultiWigTracks } from './mergeMultiWigTracks.ts'
import { resolveBigDataUri } from './resolveBigDataUri.ts'
import { makeTableFileResolver, noTableFiles } from './resolveTableBigFile.ts'
import { readJSON, splitOnFirst } from './util.ts'

import type { JBrowseConfig, TrackDbEntry, UcscTrack } from './types.ts'

interface BigDataTrack {
  tableName: string
  settings: {
    bigDataUrl?: string
    // names the golden-path table holding the file path, when there is no
    // bigDataUrl; often a different name than the track's own
    table?: string
    type?: string
    longLabel?: string
    speciesLabels?: string
    labelFields?: string
    defaultLabelFields?: string
    // bigMaf only: the zoom-reduced summary (bigMafSummary.bb) and the
    // per-species CDS reading frames (mafFrames.bb) UCSC ships beside the
    // alignment. Either may be an hgdownload path rather than a full url.
    summary?: string
    frames?: string
  }
}

function mergeDeep<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
) {
  const merged: Record<string, unknown> = {}
  for (const key of Object.keys(source)) {
    const srcVal = source[key]
    const tgtVal = target[key]
    merged[key] =
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
        ? mergeDeep(
            tgtVal as Record<string, unknown>,
            srcVal as Record<string, unknown>,
          )
        : srcVal
  }
  return Object.assign({ ...target }, merged)
}

type BigDataTracksJson = Record<string, BigDataTrack>

/**
 * The bigData and BAM tracks of a parsed trackDb: those whose 'type' starts
 * with 'big' or 'bam', with their settings string parsed into key-value pairs.
 */
function parseBigFileTracks(
  tracks: Record<string, TrackDbEntry>,
): BigDataTracksJson {
  return Object.fromEntries(
    Object.entries(tracks)
      .filter(([_key, trackEntry]) =>
        ['big', 'bam'].some(prefix => trackEntry.type.startsWith(prefix)),
      )
      .map(([key, trackEntry]) => {
        return [
          key,
          {
            ...trackEntry,
            tableName: trackEntry.tableName,
            settings: Object.fromEntries(
              trackEntry.settings
                .split('\n')
                .map(settingLine => splitOnFirst(settingLine, ' '))
                .filter(([settingKey]) => !!settingKey),
            ),
          },
        ] as const
      }),
  )
}

/**
 * Adds the trackDb's big* and bam tracks to the config: bigBed/bigMaf/bigWig/bam
 * files named by bigDataUrl or resolved from their golden-path table, each
 * probed for existence, multiWig composites folded into one track each, and
 * ucscMixins/<db>.json merged over the result.
 */
export async function addBigDataTracks({
  config,
  tracksDb,
  dbDir,
}: {
  config: JBrowseConfig
  tracksDb: Record<string, TrackDbEntry>
  dbDir: string | undefined
}) {
  const bigDataEntries = parseBigFileTracks(tracksDb)
  const baseUrl = 'https://hgdownload.soe.ucsc.edu'
  const assembly = config.assemblies[0]

  if (!assembly) {
    console.warn(
      'No assembly found in config. Skipping big data track addition.',
    )
    return
  }

  const assemblyName = assembly.name
  const sequenceAdapter = assembly.sequence?.adapter
  let mixinTracks = {}
  try {
    mixinTracks = Object.fromEntries(
      readJSON<{ tracks: Record<string, unknown>[] }>(
        'ucscMixins/' + assemblyName + '.json',
      ).tracks.map(r => [r.trackId, r] as const),
    )
  } catch (e) {
    /* do nothing */
  }

  // Tracks that name no bigDataUrl keep their file path in a golden-path table
  const resolveTable = dbDir
    ? makeTableFileResolver({ dbDir, baseUrl })
    : noTableFiles

  // multiWig composites become one MultiQuantitativeTrack each, so their
  // subtracks are skipped below rather than emitted as unrelated tracks
  const { tracks: multiWigTracks, consumed } = buildMultiWigTracks({
    tracksDb,
    assemblyName,
    baseUrl,
    resolveTable,
  })
  const newTracks: UcscTrack[] = []
  for (const entry of Object.values(bigDataEntries)) {
    const { settings, tableName } = entry
    const { type } = settings
    const trackId = `${assemblyName}-${tableName}`

    if (consumed.has(tableName)) {
      continue
    }

    // A resolved table path stands in for a missing bigDataUrl, so the branches
    // below (bigBed vs bam vs bigWig) don't each need to know where it came
    // from. It is already absolute, hence the baseUrl-prefixing below is a no-op
    // for it.
    const bigDataUrl =
      settings.bigDataUrl ?? resolveTable(settings.table ?? tableName)

    if (bigDataUrl) {
      const uri = resolveBigDataUri({ bigDataUrl, baseUrl })

      // Every track, not only the bigBed-shaped ones. This guarded
      // .bb/.bigBed/.bigMaf alone, so hg38's promoterAi composite lost its
      // overlaps.bb to the check and kept the four bigWigs beside it — all four
      // naming /gbdb/hg38/_promoterAi/, a directory hgdownload does not publish,
      // all four shipped as 404s. Whether a file exists has nothing to do with
      // its extension.
      //
      // Probe `uri`, not `bigDataUrl`: the latter is often a bare /gbdb path,
      // and prefixing it inside the check is how the mangled url above stayed
      // invisible.
      const fileAccessible = await checkIfFileAccessible({
        url: uri,
        assembly: assemblyName,
        trackName: settings.longLabel ?? tableName,
      })
      if (!fileAccessible) {
        continue
      }

      if (
        bigDataUrl.endsWith('.bb') ||
        bigDataUrl.endsWith('.bigBed') ||
        bigDataUrl.endsWith('.bigMaf')
      ) {
        if (type === 'bigMaf') {
          newTracks.push(
            await buildBigMafTrack({
              trackId,
              tableName,
              assemblyName,
              uri,
              baseUrl,
              settings,
            }),
          )
        } else {
          // bigGenePred groups transcripts into genes; UCSC's own
          // defaultLabelFields (fallback labelFields) names the gene field to
          // aggregate on, e.g. name2 for ncbiRefSeq, rather than the adapter's
          // fixed geneName2 default
          const aggregateField =
            type === 'bigGenePred'
              ? (firstField(settings.defaultLabelFields) ??
                firstField(settings.labelFields))
              : undefined
          newTracks.push({
            trackId,
            name: tableName,
            type: 'FeatureTrack',
            assemblyNames: [assemblyName],
            adapter: {
              type: 'BigBedAdapter',
              uri,
              ...(aggregateField ? { aggregateField } : {}),
            },
          })
        }
      } else if (bigDataUrl.endsWith('.bam')) {
        if (!sequenceAdapter) {
          console.warn(
            `Skipping BAM track ${tableName}: No sequence adapter found for assembly ${assemblyName}`,
          )
        } else {
          newTracks.push({
            trackId,
            name: tableName,
            type: 'AlignmentsTrack',
            assemblyNames: [assemblyName],
            // a copy, not the assembly's own adapter object: the sidecar
            // mirroring later rewrites that one's chromSizes to a local path,
            // and the embedded copy keeps naming upstream as it always has
            adapter: {
              type: 'BamAdapter',
              uri,
              sequenceAdapter: { ...sequenceAdapter },
            },
          })
        }
      } else {
        newTracks.push({
          trackId,
          name: tableName,
          type: 'QuantitativeTrack',
          assemblyNames: [assemblyName],
          adapter: { type: 'BigWigAdapter', uri },
        })
      }
    }
  }

  config.tracks = dedupe<UcscTrack>(
    [...config.tracks, ...multiWigTracks, ...newTracks],
    track => track.trackId,
  ).map(r => {
    const mixin = (mixinTracks as Record<string, Record<string, unknown>>)[
      r.trackId
    ]
    return mixin ? mergeDeep(r, mixin) : r
  })
}
