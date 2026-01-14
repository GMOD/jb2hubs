import { createTrackConfiguration } from './createTrackConfiguration.ts'
import { notEmpty } from './notEmpty.ts'
import { isChainNetTrack, isMetaTrack } from './trackUtils.ts'

import type { TrackDbFile } from '@gmod/ucsc-hub'

type Adapter = Record<string, unknown>

export function generateHubTracks({
  trackDb,
  trackDbUrl,
  assemblyName,
  sequenceAdapter,
}: {
  trackDb: TrackDbFile
  trackDbUrl: string
  assemblyName: string
  sequenceAdapter: Adapter
}) {
  return Object.entries(trackDb.data)
    .map(([trackName, track]) =>
      isMetaTrack(track) || isChainNetTrack(track)
        ? undefined
        : createTrackConfiguration({
            track,
            trackName,
            trackDb,
            trackDbUrl,
            sequenceAdapter,
            assemblyName,
          }),
    )
    .filter(f => notEmpty(f))
}
