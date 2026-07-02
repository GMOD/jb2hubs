import { SingleFileHub } from '@gmod/ucsc-hub'

import { generateHubTracks } from './generateHubTracks.ts'
import { createHtmlLink } from './trackUtils.ts'
import { makeDefaultSession, resolve } from './util.ts'

export function generateJBrowseConfigForAssemblyHub({
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
    const defaultPos = genome.data.defaultPos
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
          // hgBlat resolves the bare GenArk accession (== genomeName), so this
          // is the db a BLAT query targets; jbrowse-plugin-blat reads it to
          // know the assembly is BLAT-able and which db to query
          blatDb: genomeName,
          ucsc: {
            ...data,
            ...(htmlPath
              ? { htmlPath: createHtmlLink(htmlPath, trackDbUrl) }
              : {}),
          },
        },
        trackId: `${genomeName}-ReferenceSequenceTrack`,
        adapter: sequenceAdapter,
      },
      ...(chromAliasBb
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
      ...(defaultPos
        ? { defaultSession: makeDefaultSession(asm.name, defaultPos) }
        : {}),
    }
  }
  throw new Error('not a single file hub')
}
