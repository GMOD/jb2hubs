import { categoryMap } from './const.ts'
import { createHtmlLink, extractParentTracks } from './trackUtils.ts'
import { isUsableMafSummary, resolve } from './util.ts'

import type { Adapter } from './types.ts'
import type { RaStanza, TrackDbFile } from '@gmod/ucsc-hub'

function makeAdapterConf(
  baseTrackType: string,
  uri: string,
  sequenceAdapter: Adapter,
  data: RaStanza['data'],
  trackDbUrl: string,
) {
  if (baseTrackType === 'bam') {
    return { type: 'AlignmentsTrack', adapter: { type: 'BamAdapter', uri } }
  } else if (baseTrackType === 'cram') {
    return {
      type: 'AlignmentsTrack',
      adapter: { type: 'CramAdapter', uri, sequenceAdapter },
    }
  } else if (baseTrackType === 'bigWig') {
    return {
      type: 'QuantitativeTrack',
      adapter: { type: 'BigWigAdapter', uri },
    }
  } else if (baseTrackType === 'bigMaf') {
    // Skip degenerate `tinySummary.bb` placeholders (see isUsableMafSummary).
    const summaryUri = isUsableMafSummary(data.summary)
      ? resolve(data.summary, trackDbUrl)
      : undefined
    return {
      type: 'MafTrack',
      adapter: {
        type: 'BigMafAdapter',
        bigBedLocation: { uri },
        ...(summaryUri
          ? {
              summaryAdapter: {
                type: 'BigBedAdapter',
                bigBedLocation: { uri: summaryUri },
              },
            }
          : {}),
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
        uri,
        ...(disableGeneHeuristic ? { disableGeneHeuristic: true } : {}),
      },
    }
  } else if (baseTrackType === 'vcfTabix') {
    return { type: 'VariantTrack', adapter: { type: 'VcfTabixAdapter', uri } }
  } else if (baseTrackType === 'hic') {
    return { type: 'HicTrack', adapter: { type: 'HicAdapter', uri } }
  }
  return undefined
}

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
  const parentTracks = extractParentTracks(trackName, trackDb)
  const effectiveGroup =
    group ?? parentTracks.find(p => p.data.group)?.data.group

  return conf
    ? {
        metadata: {
          ucsc: {
            ...data,
            ...(html ? { html: createHtmlLink(html, trackDbUrl) } : {}),
          },
        },
        category: [effectiveGroup]
          .filter(f => !!f)
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          .map(f => categoryMap[f as keyof typeof categoryMap] ?? f),
        ...conf,
        name: [
          ...new Set([
            ...parentTracks
              .map(p => trackDb.data[p.name!]?.data.shortLabel)
              .filter(s => s !== undefined),
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
  const parent = data.parent ?? ''
  const bigDataUrlPre = data.bigDataUrl ?? ''
  const bigDataIdx = data.bigDataIndex ?? ''
  if (bigDataIdx) {
    throw new Error("Don't yet support bigDataIdx")
  }
  const name =
    (data.shortLabel ?? '') + (bigDataUrlPre.includes('xeno') ? ' (xeno)' : '')
  const trackType = data.type ?? trackDb.data[parent]?.data.type ?? ''
  let baseTrackType = trackType.split(' ')[0] ?? ''
  if (
    baseTrackType === 'bam' &&
    bigDataUrlPre.toLowerCase().endsWith('.cram')
  ) {
    baseTrackType = 'cram'
  }
  const uri = resolve(bigDataUrlPre, trackDbUrl)
  const adapterConf = makeAdapterConf(
    baseTrackType,
    uri,
    sequenceAdapter,
    data,
    trackDbUrl,
  )
  if (!adapterConf) {
    console.error('Unknown track:', name, baseTrackType)
  }
  return adapterConf
    ? {
        trackId: `${assemblyName}-${data.track}`,
        description: data.longLabel,
        assemblyNames: [assemblyName],
        name,
        ...adapterConf,
      }
    : undefined
}
