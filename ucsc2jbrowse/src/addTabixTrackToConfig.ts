import path from 'path'

import { readConfig, writeJSON } from './util.ts'

// The bed and gff adders were separate, byte-identical files differing only in
// these three strings. They stay separate CLI entry points (addBedTabixTrack /
// addGffTabixTrack) because createConfigsForGoldenPath.sh globs the two file
// types separately, but the logic lives here once.
export interface TabixTrackKind {
  /** Extension stripped to derive the trackId, e.g. '.bed.gz' */
  extension: string
  /** JBrowse adapter type, e.g. 'BedTabixAdapter' */
  adapterType: string
  /** Adapter field naming the data file, e.g. 'bedGzLocation' */
  locationField: string
}

export const BED_TABIX: TabixTrackKind = {
  extension: '.bed.gz',
  adapterType: 'BedTabixAdapter',
  locationField: 'bedGzLocation',
}

export const GFF_TABIX: TabixTrackKind = {
  extension: '.gff.gz',
  adapterType: 'Gff3TabixAdapter',
  locationField: 'gffGzLocation',
}

function tabixTrack(
  assemblyName: string,
  filePath: string,
  kind: TabixTrackKind,
) {
  const fileName = path.basename(filePath)
  const trackId = path.basename(fileName, kind.extension)
  return {
    type: 'FeatureTrack',
    trackId: `${assemblyName}-${trackId}`,
    name: trackId,
    assemblyNames: [assemblyName],
    adapter: {
      type: kind.adapterType,
      [kind.locationField]: { uri: fileName },
      index: {
        indexType: 'CSI',
        location: { uri: `${fileName}.csi` },
      },
    },
  }
}

/**
 * Adds one or more tabix-indexed tracks to a JBrowse configuration file, reading
 * and writing the config a single time for the whole batch.
 */
export function addTabixTracksToConfig(
  configPath: string,
  filePaths: string[],
  kind: TabixTrackKind,
) {
  const config = readConfig(configPath)
  const assemblyName = config.assemblies[0]?.name

  if (!assemblyName) {
    throw new Error('Assembly name not found in config')
  }

  for (const filePath of filePaths) {
    const newTrack = tabixTrack(assemblyName, filePath, kind)
    const existingTrackIndex = config.tracks.findIndex(
      track => track.trackId === newTrack.trackId,
    )
    if (existingTrackIndex === -1) {
      config.tracks.push(newTrack)
    } else {
      config.tracks[existingTrackIndex] = newTrack
    }
  }

  writeJSON(configPath, config)
}

/** Shared CLI wrapper for the two entry points. */
export function runTabixTrackAdderCli(kind: TabixTrackKind, usage: string) {
  if (process.argv.length < 4) {
    console.error(usage)
    process.exit(1)
  }
  addTabixTracksToConfig(process.argv[2]!, process.argv.slice(3), kind)
}
