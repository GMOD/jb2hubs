import { categoryMap } from './const.ts'
import { createHtmlLink, extractParentTracks } from './trackUtils.ts'

import type { RaStanza, TrackDbFile } from '@gmod/ucsc-hub'

type Adapter = Record<string, unknown>

export function createTrackConfiguration({
  track,
  trackName,
  trackDb,
  trackDbUrl,
  sequenceAdapter,
  assemblyName,
}: {
  track: RaStanza
  trackName: string
  trackDb: TrackDbFile
  trackDbUrl: string
  sequenceAdapter: Adapter
  assemblyName: string
}) {
  const conf = makeTrackConfig({
    track,
    trackDbUrl,
    trackDb,
    sequenceAdapter,
    assemblyName,
  })
  const { data } = track
  const { group, html } = data

  // Get parent tracks to extract both group and shortLabel information
  const parentTracks = extractParentTracks(trackName, trackDb)

  // Find group from current track or first parent that has one
  const effectiveGroup =
    group ?? parentTracks.find(p => p.data.group)?.data.group

  return conf
    ? {
        metadata: {
          ucsc: {
            ...data,
            ...(html
              ? {
                  html: createHtmlLink(html, trackDbUrl),
                }
              : {}),
          },
        },
        category: [
          effectiveGroup,
          // ,
        ]
          .filter(f => !!f)
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          .map(f => categoryMap[f as keyof typeof categoryMap] ?? f),
        ...conf,
        name: [
          ...new Set([
            ...parentTracks.map(p => trackDb.data[p.name!]?.data.shortLabel),
            conf.name,
          ]),
        ].join(' - '),
      }
    : undefined
}

function makeTrackConfig({
  track,
  trackDbUrl,
  trackDb,
  sequenceAdapter,
  assemblyName,
}: {
  track: RaStanza
  trackDbUrl: string
  trackDb: TrackDbFile
  sequenceAdapter: Adapter
  assemblyName: string
}) {
  const { data } = track
  const bigDataUrlPre = data.bigDataUrl ?? ''
  const name =
    (data.shortLabel ?? '') + (bigDataUrlPre.includes('xeno') ? ' (xeno)' : '')
  const conf = makeTrackConfigSub({
    track,
    trackDbUrl,
    trackDb,
    sequenceAdapter,
  })
  return conf
    ? {
        trackId: `${assemblyName}-${data.track}`,
        description: data.longLabel,
        assemblyNames: [assemblyName],
        name,
        ...conf,
      }
    : undefined
}

function makeTrackConfigSub({
  track,
  trackDbUrl,
  trackDb,
  sequenceAdapter,
}: {
  track: RaStanza
  trackDbUrl: string
  trackDb: TrackDbFile
  sequenceAdapter: Adapter
}) {
  const { data } = track
  const parent = data.parent ?? ''
  const bigDataUrlPre = data.bigDataUrl ?? ''
  const bigDataIdx = data.bigDataIndex ?? ''
  if (bigDataIdx) {
    throw new Error("Don't yet support bigDataIdx")
  }
  const trackType = data.type ?? trackDb.data[parent]!.data.type ?? ''
  const name =
    (data.shortLabel ?? '') + (bigDataUrlPre.includes('xeno') ? ' (xeno)' : '')

  let baseTrackType = trackType.split(' ')[0] ?? ''
  if (baseTrackType === 'bam' && bigDataUrlPre.toLowerCase().endsWith('cram')) {
    baseTrackType = 'cram'
  }
  const bigDataUrl = new URL(bigDataUrlPre, trackDbUrl)

  if (baseTrackType === 'bam') {
    return {
      type: 'AlignmentsTrack',
      adapter: {
        type: 'BamAdapter',
        uri: bigDataUrl,
      },
    }
  } else if (baseTrackType === 'cram') {
    return {
      type: 'AlignmentsTrack',
      adapter: {
        type: 'CramAdapter',
        uri: bigDataUrl,
        sequenceAdapter,
      },
    }
  } else if (baseTrackType === 'bigWig') {
    return {
      type: 'QuantitativeTrack',
      adapter: {
        type: 'BigWigAdapter',
        uri: bigDataUrl,
      },
    }
  } else if (baseTrackType.startsWith('big')) {
    const trackName = data.track ?? ''
    const disableGeneHeuristic =
      trackName.endsWith('tandemDups') || trackName.endsWith('gapOverlap')
    return {
      type: 'FeatureTrack',
      adapter: {
        type: 'BigBedAdapter',
        uri: bigDataUrl,
        ...(disableGeneHeuristic ? { disableGeneHeuristic: true } : {}),
      },
    }
  } else if (baseTrackType === 'vcfTabix') {
    return {
      type: 'VariantTrack',
      adapter: {
        type: 'VcfTabixAdapter',
        uri: bigDataUrl,
      },
    }
  } else if (baseTrackType === 'hic') {
    return {
      type: 'HicTrack',
      adapter: {
        type: 'HicAdapter',
        uri: bigDataUrl,
      },
    }
  } else {
    // unsupported types
    //     case 'peptideMapping':
    //     case 'gvf':
    //     case 'ld2':
    //     case 'narrowPeak':
    //     case 'wig':
    //     case 'wigMaf':
    //     case 'halSnake':
    //     case 'bed':
    //     case 'bed5FloatScore':
    //     case 'bedGraph':
    //     case 'bedRnaElements':
    //     case 'broadPeak':
    //     case 'coloredExon':
    console.error('Unknown track:', name, baseTrackType)
    return undefined
  }
}
