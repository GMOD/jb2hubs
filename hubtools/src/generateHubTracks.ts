import { createTrackConfiguration } from './createTrackConfiguration.ts'
import { notEmpty } from './notEmpty.ts'
import {
  extractParentTracks,
  isChainNetTrack,
  isMetaTrack,
} from './trackUtils.ts'

import type { TrackDbFile } from '@gmod/ucsc-hub'

type Adapter = Record<string, unknown> & { type: string }

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
    .map(([trackName, track]) => {
      if (isMetaTrack(track) || isChainNetTrack(track)) {
        return undefined
      }
      const parents = extractParentTracks(trackName, trackDb)
      if (parents.some(p => isChainNetTrack(p))) {
        return undefined
      }
      return createTrackConfiguration({
        track,
        trackName,
        trackDb,
        trackDbUrl,
        sequenceAdapter,
        assemblyName,
      })
    })
    .filter(notEmpty)
}
