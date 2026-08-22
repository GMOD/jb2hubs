import { resolve } from './util.ts'

import type { RaStanza, TrackDbFile } from '@gmod/ucsc-hub'

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHTML(str: string) {
  return str.replaceAll(/[&<>"']/g, c => htmlEscapes[c]!)
}

// `html` is hub-supplied text going into markup that ends up in a published
// config, so it is escaped on both sides of the tag rather than relying on
// whatever sanitizer happens to sit at the far end of a reader
export function createHtmlLink(html: string, trackDbUrl: string): string {
  return `<a href="${escapeHTML(resolve(html, trackDbUrl))}">${escapeHTML(html)}</a>`
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
  const { shortLabel, longLabel, type } = obj.data
  return (
    (shortLabel?.includes('Chain/Net') ?? false) ||
    (longLabel?.includes('Chain/Net') ?? false) ||
    (type?.startsWith('bigChain') ?? false)
  )
}
