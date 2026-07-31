import { categoryMap } from './const.ts'
import { firstField } from './featureDisplay.ts'
import { mafSamplesFromSpeciesOrder } from './mafSamples.ts'
import { createHtmlLink, extractParentTracks } from './trackUtils.ts'
import { resolve } from './util.ts'

import type { SampleAssemblyResolver } from './mafSamples.ts'
import type { Adapter } from './types.ts'
import type { RaStanza, TrackDbFile } from '@gmod/ucsc-hub'

function makeAdapterConf(
  baseTrackType: string,
  uri: string,
  sequenceAdapter: Adapter,
  data: RaStanza['data'],
  trackDbUrl: string,
  assemblyName: string,
  resolveSampleAssembly?: SampleAssemblyResolver,
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
    const summaryUri = data.summary
      ? resolve(data.summary, trackDbUrl)
      : undefined
    // UCSC ships the CDS reading frames next to the alignment (mafFrames.bb);
    // without it the codon view and codon conservation have nothing to draw
    const framesUri = data.frames ? resolve(data.frames, trackDbUrl) : undefined
    const samples = data.speciesOrder
      ? mafSamplesFromSpeciesOrder({
          speciesOrder: data.speciesOrder,
          referenceGenome: assemblyName,
          resolveSampleAssembly,
        })
      : undefined
    return {
      type: 'MafTrack',
      adapter: {
        type: 'BigMafAdapter',
        bigBedLocation: { uri },
        ...(samples ? { samples } : {}),
        ...(summaryUri
          ? {
              summaryAdapter: {
                type: 'BigBedAdapter',
                bigBedLocation: { uri: summaryUri },
              },
            }
          : {}),
        ...(framesUri
          ? {
              annotationAdapter: {
                type: 'BigBedAdapter',
                bigBedLocation: { uri: framesUri },
              },
            }
          : {}),
      },
    }
  } else if (baseTrackType.startsWith('big')) {
    const trackName = data.track ?? ''
    const disableGeneHeuristic =
      trackName.endsWith('tandemDups') || trackName.endsWith('gapOverlap')
    // bigGenePred groups transcripts into genes; UCSC's own defaultLabelFields
    // (fallback labelFields) names the gene field to aggregate on, e.g. name2
    // for ncbiRefSeq, rather than the adapter's fixed geneName2 default
    const aggregateField =
      baseTrackType === 'bigGenePred'
        ? (firstField(data.defaultLabelFields) ?? firstField(data.labelFields))
        : undefined
    return {
      type: 'FeatureTrack',
      adapter: {
        type: 'BigBedAdapter',
        uri,
        ...(disableGeneHeuristic ? { disableGeneHeuristic: true } : {}),
        ...(aggregateField ? { aggregateField } : {}),
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
  resolveSampleAssembly,
}: {
  track: RaStanza
  trackName: string
  trackDb: TrackDbFile
  trackDbUrl: string
  sequenceAdapter: Adapter
  assemblyName: string
  resolveSampleAssembly?: SampleAssemblyResolver
}) {
  const conf = makeTrackConfig({
    track,
    trackDbUrl,
    trackDb,
    sequenceAdapter,
    assemblyName,
    resolveSampleAssembly,
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
  resolveSampleAssembly,
}: {
  track: RaStanza
  trackDbUrl: string
  trackDb: TrackDbFile
  sequenceAdapter: Adapter
  assemblyName: string
  resolveSampleAssembly?: SampleAssemblyResolver
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
    assemblyName,
    resolveSampleAssembly,
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
