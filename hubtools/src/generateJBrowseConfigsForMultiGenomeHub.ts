import { GenomesFile, HubFile, TrackDbFile } from '@gmod/ucsc-hub'

import { generateHubTracks } from './generateHubTracks.ts'
import { myfetchtext, resolve } from './util.ts'

/**
 * Generates JBrowse 2 configs for all assemblies in a traditional multi-genome
 * UCSC hub (hub.txt with genomesFile pointing to genomes.txt).
 *
 * Skips genome stanzas that don't have a twoBitPath (e.g. hosted UCSC
 * reference assemblies like mm10 or rn6).
 *
 * @param hubUrl - URL to the hub.txt file
 * @returns Array of { genomeName, config } for each genome with a twoBitPath
 */
export async function generateJBrowseConfigsForMultiGenomeHub(
  hubUrl: string,
): Promise<Array<{ genomeName: string; config: Record<string, unknown> }>> {
  const hubFileText = await myfetchtext(hubUrl)
  const hub = new HubFile(hubFileText)

  const genomesFileRelUrl = hub.data['genomesFile']
  if (!genomesFileRelUrl) {
    throw new Error('Hub file does not have a genomesFile field')
  }

  const genomesFileUrl = resolve(genomesFileRelUrl, hubUrl)
  const genomesFileText = await myfetchtext(genomesFileUrl)
  const genomesFile = new GenomesFile(genomesFileText, {
    skipValidation: true,
  })

  const configs: Array<{
    genomeName: string
    config: Record<string, unknown>
  }> = []

  for (const [genomeName, genomeStanza] of Object.entries(genomesFile.data)) {
    const { twoBitPath, trackDb, defaultPos, description, organism, htmlPath } =
      genomeStanza.data

    // Skip assemblies hosted by UCSC (e.g. mm10, rn6) that don't have
    // their own twoBitPath in the hub
    if (!twoBitPath || !trackDb) {
      continue
    }

    const twoBitUrl = resolve(twoBitPath, genomesFileUrl)
    // Derive chromSizes from the 2bit file path
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

    const asm = {
      name: genomeName,
      displayName: description || organism || genomeName,
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

    const config: Record<string, unknown> = {
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

    configs.push({ genomeName, config })
  }

  return configs
}
