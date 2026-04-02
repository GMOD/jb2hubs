import { resolve } from './util.ts'

import type { RaStanza, TrackDbFile } from '@gmod/ucsc-hub'

export function createHtmlLink(html: string, trackDbUrl: string): string {
  return `<a href="${resolve(html, trackDbUrl)}">${html}</a>`
}

export function extractParentTracks(
  trackName: string,
  trackDb: TrackDbFile,
): RaStanza[] {
  const parentName =
    (trackDb.data[trackName]?.data.parent ?? '').split(' ')[0] ?? ''
  return parentName
    ? [...extractParentTracks(parentName, trackDb), trackDb.data[parentName]!]
    : []
}

export function isMetaTrack(obj: RaStanza) {
  const parentTrackKeys = new Set([
    'superTrack',
    'compositeTrack',
    'container',
    'view',
  ])

  return Object.keys(obj.data).some(key => parentTrackKeys.has(key))
}

// Chain/Net tracks are legacy UCSC chain/net tracks that we replace with
// our own synteny tracks using PIF format
export function isChainNetTrack(obj: RaStanza) {
  const { shortLabel, longLabel } = obj.data
  return (
    (shortLabel?.includes('Chain/Net') ?? false) ||
    (longLabel?.includes('Chain/Net') ?? false)
  )
}
