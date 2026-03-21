import { GenomesFile, HubFile, TrackDbFile } from '@gmod/ucsc-hub'

import { generateHubTracks } from './generateHubTracks.ts'
import { myfetchtext, resolve } from './util.ts'

export async function generateJBrowseConfigsForMultiGenomeHub(hubUrl: string) {
  const hubFileText = await myfetchtext(hubUrl)
  const hub = new HubFile(hubFileText)

  const genomesFileRelUrl = hub.data['genomesFile']
  if (!genomesFileRelUrl) {
    throw new Error('Hub file does not have a genomesFile field')
  }

  const genomesFileUrl = resolve(genomesFileRelUrl, hubUrl)
  const genomesFileText = await myfetchtext(genomesFileUrl)
  const genomesFile = new GenomesFile(genomesFileText)

  const configs = []

  for (const [genomeName, genomeStanza] of Object.entries(genomesFile.data)) {
    const { twoBitPath, trackDb, defaultPos, description, organism, htmlPath } =
      genomeStanza.data

    // Skip assemblies hosted by UCSC (e.g. mm10, rn6) that don't have
    // their own twoBitPath in the hub
    if (!twoBitPath || !trackDb) {
      continue
    }

    const twoBitUrl = resolve(twoBitPath, genomesFileUrl)
    const chromSizesUrl = twoBitUrl.replace(/\.2bit$/, '.chrom.sizes')
    const trackDbUrl = resolve(trackDb, genomesFileUrl)

    let trackDbFile: TrackDbFile
    try {
      const trackDbText = await myfetchtext(trackDbUrl)
      trackDbFile = new TrackDbFile(trackDbText)
    } catch (e) {
      console.warn(`Failed to load trackDb for ${genomeName}: ${e}`)
      continue
    }

    const sequenceAdapter = {
      type: 'TwoBitAdapter',
      uri: twoBitUrl,
      chromSizes: chromSizesUrl,
    }

    const displayName = description || organism || genomeName

    const asm = {
      name: genomeName,
      displayName,
      sequence: {
        type: 'ReferenceSequenceTrack',
        metadata: {
          ucsc: {
            ...genomeStanza.data,
            ...(htmlPath
              ? {
                  htmlPath: `<a href="${resolve(htmlPath, genomesFileUrl)}">${htmlPath}</a>`,
                }
              : {}),
          },
        },
        trackId: `${genomeName}-ReferenceSequenceTrack`,
        adapter: sequenceAdapter,
      },
    }

    const tracks = generateHubTracks({
      trackDb: trackDbFile,
      trackDbUrl,
      assemblyName: genomeName,
      sequenceAdapter,
    })

    const config = {
      assemblies: [asm],
      tracks,
      ...(defaultPos
        ? {
            defaultSession: {
              name: genomeName,
              widgets: {
                hierarchicalTrackSelector: {
                  id: 'hierarchicalTrackSelector',
                  type: 'HierarchicalTrackSelectorWidget',
                  view: 'initialView',
                },
              },
              activeWidgets: {
                hierarchicalTrackSelector: 'hierarchicalTrackSelector',
              },
              views: [
                {
                  type: 'LinearGenomeView',
                  id: 'initialView',
                  init: {
                    assembly: genomeName,
                    loc: defaultPos,
                  },
                },
              ],
            },
          }
        : {}),
    }

    configs.push({
      genomeName,
      displayName,
      organism: organism ?? '',
      defaultPos: defaultPos ?? '',
      config,
    })
  }

  return configs
}
