import fs from 'fs'

import type { JBrowseConfig } from './types.ts'

// The bed and gff adders were separate, byte-identical files differing only in
// these three strings.
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
  fileName: string,
  kind: TabixTrackKind,
) {
  const trackId = fileName.slice(0, -kind.extension.length)
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
 * Adds a track for each tabix-indexed file the derivation scripts left in the
 * built directory: every *.bed.gz, then every *.gff.gz. `<db>.gff.gz` is
 * skipped: that name is the NCBI RefSeq copy addNcbiRefSeqGffTrack registers
 * itself, and the generic adder would mint a second, category-less `<db>-<db>`
 * track pointing at the same file.
 */
export function addDerivedTabixTracks(config: JBrowseConfig, dir: string) {
  const assemblyName = config.assemblies[0]?.name
  if (!assemblyName) {
    throw new Error('Assembly name not found in config')
  }
  const files = fs.readdirSync(dir).sort()
  for (const kind of [BED_TABIX, GFF_TABIX]) {
    for (const fileName of files) {
      if (
        fileName.endsWith(kind.extension) &&
        fileName !== `${assemblyName}.gff.gz`
      ) {
        const newTrack = tabixTrack(assemblyName, fileName, kind)
        const existing = config.tracks.findIndex(
          track => track.trackId === newTrack.trackId,
        )
        if (existing === -1) {
          config.tracks.push(newTrack)
        } else {
          config.tracks[existing] = newTrack
        }
      }
    }
  }
}
