import { SingleFileHub } from '@gmod/ucsc-hub'

import { generateHubTracks } from './generateHubTracks.ts'
import { resolve } from './util.ts'

async function hasAliases(url: string) {
  let hasAliases = false
  try {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error('Error fetching chromAlias')
    }
    hasAliases = true
  } catch (_e) {}
  return hasAliases
}

export async function generateJBrowseConfigForAssemblyHub({
  hubFileText,
  trackDbUrl,
}: {
  hubFileText: string
  trackDbUrl: string
}) {
  if (hubFileText.includes('useOneFile on')) {
    const hub = new SingleFileHub(hubFileText)
    const { genome, tracks } = hub
    const { data } = genome
    const { twoBitPath, chromSizes, htmlPath, chromAliasBb } = data
    const genomeName = genome.name!
    const shortLabel = data.description

    if (!twoBitPath) {
      throw new Error('No twoBitPath')
    }
    if (!chromSizes) {
      throw new Error('No chromSizes')
    }
    const sequenceAdapter = {
      type: 'TwoBitAdapter',
      uri: resolve(twoBitPath, trackDbUrl),
      chromSizes: resolve(chromSizes, trackDbUrl),
    }
    const asm = {
      name: genomeName,
      displayName: shortLabel,
      sequence: {
        type: 'ReferenceSequenceTrack',
        metadata: {
          ...data,
          ...(htmlPath
            ? {
                htmlPath: `<a href="${resolve(htmlPath, trackDbUrl)}">${htmlPath}</a>`,
              }
            : {}),
        },
        trackId: `${genomeName}-ReferenceSequenceTrack`,
        adapter: sequenceAdapter,
      },
      ...(chromAliasBb &&
      (await hasAliases(
        resolve(chromAliasBb.replace('.bb', '.txt'), trackDbUrl),
      ))
        ? {
            refNameAliases: {
              adapter: {
                type: 'RefNameAliasAdapter',
                refNameColumnHeaderName: 'ucsc',
                uri: resolve(chromAliasBb.replace('.bb', '.txt'), trackDbUrl),
              },
            },
          }
        : {}),
    }

    return {
      assemblies: [asm],
      tracks: generateHubTracks({
        trackDb: tracks,
        trackDbUrl,
        assemblyName: genomeName,
        sequenceAdapter,
      }),
    }
  }
  throw new Error('not a single file hub')
}
