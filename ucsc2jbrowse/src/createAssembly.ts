/* eslint-disable no-console */
import { gunzipSync } from 'node:zlib'

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
  // Prefer cytoBand (curated banding); fall back to cytoBandIdeo. Whichever
  // resolves, drop it when every band is 'gneg' — a placeholder ideogram with no
  // real banding information, not worth wiring up as a cytobands adapter.
  const cytoTxtLink = getCytoBandLink()
  const cytoIdeoLink = getCytoBandIdeoLink()
  const primaryRes = await fetch(cytoTxtLink)
  const [link, res] = primaryRes.ok
    ? [cytoTxtLink, primaryRes]
    : [cytoIdeoLink, await fetch(cytoIdeoLink)]
  if (!res.ok) {
    throw new Error('Error fetching cytobands')
  }
  const txt = new TextDecoder().decode(
    gunzipSync(Buffer.from(await res.arrayBuffer())),
  )
  const allGneg = txt
    .split('\n')
    .map(f => f.trim())
    .filter(f => !!f)
    .every(line => line.split('\t')[4] === 'gneg')
  cytoLink = allGneg ? undefined : link
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
            // for UCSC golden-path assemblies the db BLAT queries against is
            // just the assembly name; jbrowse-plugin-blat reads blatDb to know
            // the assembly is BLAT-able and which db to query
            metadata: { ...metadata, blatDb: assemblyName },
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
