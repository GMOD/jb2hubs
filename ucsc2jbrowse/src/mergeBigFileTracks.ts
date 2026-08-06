import { dedupe, firstField } from 'hubtools'

import { buildBigMafTrack } from './buildBigMafTrack.ts'
import { checkIfFileAccessible } from './checkIfFileAccessible.ts'
import { buildMultiWigTracks } from './mergeMultiWigTracks.ts'
import { makeTableFileResolver, noTableFiles } from './resolveTableBigFile.ts'
import { readConfig, readJSON, splitOnFirst, writeJSON } from './util.ts'

import type { TrackDbEntry } from './types.ts'

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

function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const srcVal = source[key]
    const tgtVal = result[key]
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = mergeDeep(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      )
    } else {
      result[key] = srcVal
    }
  }
  return result
}

type BigDataTracksJson = Record<string, BigDataTrack>

/**
 * Parses a tracks.json file to extract information about bigData and BAM tracks.
 * It filters tracks based on their 'type' (starting with 'big' or 'bam')
 * and processes their settings string into a key-value object
 *
 * @param tracksJsonPath The path to the tracks.json file.
 * @returns A promise that resolves to the parsed big file tracks.
 */
function parseBigFileTracks(tracksJsonPath: string): BigDataTracksJson {
  const tracks = readJSON<Record<string, TrackDbEntry>>(tracksJsonPath)

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

async function addBigDataTracks(
  bigDataEntries: BigDataTracksJson,
  tracksDb: Record<string, TrackDbEntry>,
  configPath: string,
  dbDir: string | undefined,
) {
  const config = readConfig(configPath)
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
  const newTracks = []
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
      const uri = bigDataUrl.startsWith(baseUrl)
        ? bigDataUrl
        : `${baseUrl}${bigDataUrl}`

      if (
        bigDataUrl.endsWith('.bb') ||
        bigDataUrl.endsWith('.bigBed') ||
        bigDataUrl.endsWith('.bigMaf')
      ) {
        const fileAccessible = await checkIfFileAccessible({
          url: bigDataUrl,
          trackName: settings.longLabel ?? tableName,
        })
        if (fileAccessible) {
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
            adapter: { type: 'BamAdapter', uri, sequenceAdapter },
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

  writeJSON(configPath, {
    ...config,
    tracks: dedupe(
      [...config.tracks, ...multiWigTracks, ...newTracks],
      track => track.trackId,
    ).map(r => {
      const mixin = (mixinTracks as Record<string, Record<string, unknown>>)[
        r.trackId
      ]
      return mixin ? mergeDeep(r, mixin) : r
    }),
  })
}

if (process.argv.length < 4) {
  console.error(
    'Usage: node mergeBigFileTracks.ts <tracks.json> <config.json> [databaseDir]',
  )
  process.exit(1)
}

const tracksJsonPath = process.argv[2]!
const configPath = process.argv[3]!

await addBigDataTracks(
  parseBigFileTracks(tracksJsonPath),
  readJSON<Record<string, TrackDbEntry>>(tracksJsonPath),
  configPath,
  process.argv[4],
)
