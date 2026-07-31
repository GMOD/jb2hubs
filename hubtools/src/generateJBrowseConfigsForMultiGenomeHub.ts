import { GenomesFile, HubFile, TrackDbFile } from '@gmod/ucsc-hub'

import { generateHubTracks } from './generateHubTracks.ts'
import { createHtmlLink } from './trackUtils.ts'
import { makeDefaultSession, myfetchtext, resolve } from './util.ts'

import type { SampleAssemblyResolver } from './mafSamples.ts'

// Fetches a trackDb file and recursively resolves `include` directives,
// returning the concatenated text of all included files.
async function fetchTrackDbWithIncludes(trackDbUrl: string): Promise<string> {
  const text = await myfetchtext(trackDbUrl)
  const includes = [...text.matchAll(/^include\s+(\S+)/gm)]
  if (!includes.length) {
    return text
  }
  const parts = await Promise.all(
    includes.map(async ([, path]) => {
      try {
        return await fetchTrackDbWithIncludes(resolve(path!, trackDbUrl))
      } catch (e) {
        console.warn(`Failed to fetch included trackDb ${path}: ${e}`)
        return ''
      }
    }),
  )
  return [text, ...parts].join('\n\n')
}

export async function generateJBrowseConfigsForMultiGenomeHub(
  hubUrl: string,
  {
    resolveSampleAssembly,
  }: {
    /**
     * Maps a MAF sample id (a genome id from the hub's `speciesOrder`) to the
     * assembly + hosted config the portal serves it as, making that row
     * navigable. Supplied by the caller because only it knows where the
     * generated configs are published to.
     */
    resolveSampleAssembly?: SampleAssemblyResolver
  } = {},
) {
  const hubFileText = await myfetchtext(hubUrl)
  const hub = new HubFile(hubFileText)

  const genomesFileRelUrl = hub.data.genomesFile
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
      trackDbFile = new TrackDbFile(await fetchTrackDbWithIncludes(trackDbUrl))
    } catch (e) {
      console.warn(`Failed to load trackDb for ${genomeName}: ${e}`)
      continue
    }

    const sequenceAdapter = {
      type: 'TwoBitAdapter',
      uri: twoBitUrl,
      chromSizes: chromSizesUrl,
    }

    const displayName = description ?? organism ?? genomeName

    const asm = {
      name: genomeName,
      displayName,
      sequence: {
        type: 'ReferenceSequenceTrack',
        metadata: {
          ucsc: {
            ...genomeStanza.data,
            ...(htmlPath
              ? { htmlPath: createHtmlLink(htmlPath, genomesFileUrl) }
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
      resolveSampleAssembly,
    })

    const config = {
      assemblies: [asm],
      tracks,
      ...(defaultPos
        ? { defaultSession: makeDefaultSession(genomeName, defaultPos) }
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
