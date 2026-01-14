/* eslint-disable no-console */
import { inflate } from 'pako'

import { readJSON, requireArg } from './util.ts'

if (process.argv.length !== 4) {
  console.error('Usage: node createAssembly.ts <assemblyName> <listJsonPath>')
  process.exit(1)
}

const assemblyName = requireArg(process.argv[2], 'assemblyName is required')
const list = requireArg(process.argv[3], 'listJsonPath is required')

const getBigDataLink = (j: string) =>
  `https://hgdownload.soe.ucsc.edu/goldenPath/${assemblyName}/bigZips/${j}`

const getCytoBandLink = () =>
  `https://hgdownload.soe.ucsc.edu/goldenPath/${assemblyName}/database/cytoBand.txt.gz`

const getCytoBandIdeoLink = () =>
  `https://hgdownload.soe.ucsc.edu/goldenPath/${assemblyName}/database/cytoBandIdeo.txt.gz`

let hasAliases = false
try {
  const res = await fetch(getBigDataLink(`${assemblyName}.chromAlias.txt`))
  if (!res.ok) {
    throw new Error('Error fetching chromAlias')
  }
  hasAliases = true
} catch (_e) {}

let cytoLink = undefined
try {
  const cytoTxtLink = getCytoBandLink()
  const res = await fetch(cytoTxtLink)
  if (!res.ok) {
    const cytoIdeoLink = getCytoBandIdeoLink()
    const ideoRes = await fetch(cytoIdeoLink)
    if (!ideoRes.ok) {
      throw new Error('Error fetching cytobands')
    }
    const ret = await ideoRes.arrayBuffer()
    const text = inflate(ret)
    const txt = new TextDecoder().decode(text)
    const allGneg = txt
      .split('\n')
      .map(f => f.trim())
      .filter(f => !!f)
      .every(line => line.split('\t')[4] === 'gneg')
    cytoLink = allGneg ? undefined : cytoIdeoLink
  } else {
    const ret = await res.arrayBuffer()
    const text = inflate(ret)
    const txt = new TextDecoder().decode(text)
    const allGneg = txt
      .split('\n')
      .map(f => f.trim())
      .filter(f => !!f)
      .every(line => line.split('\t')[4] === 'gneg')
    cytoLink = allGneg ? undefined : cytoTxtLink
  }
} catch (_e) {}

interface GenomeRecord {
  organism: string
}

const metadata = readJSON<{ ucscGenomes: Record<string, GenomeRecord> }>(list)
  .ucscGenomes[assemblyName]
console.log(
  JSON.stringify(
    {
      assemblies: [
        {
          name: assemblyName,
          displayName: `${metadata?.organism} (${assemblyName})`,
          sequence: {
            type: 'ReferenceSequenceTrack',
            trackId: `${assemblyName}-refseq`,
            metadata,
            adapter: {
              type: 'TwoBitAdapter',
              uri: getBigDataLink(`${assemblyName}.2bit`),
              chromSizes: getBigDataLink(`${assemblyName}.chrom.sizes`),
            },
          },
          ...(hasAliases
            ? {
                refNameAliases: {
                  adapter: {
                    type: 'RefNameAliasAdapter',
                    uri: getBigDataLink(`${assemblyName}.chromAlias.txt`),
                  },
                },
              }
            : {}),
          ...(cytoLink
            ? {
                cytobands: {
                  adapter: {
                    type: 'CytobandAdapter',
                    uri: cytoLink,
                  },
                },
              }
            : {}),
        },
      ],
      tracks: [],
    },
    null,
    2,
  ),
)

export {}
