/* eslint-disable no-console */
import { readJSON, requireArg } from './util.ts'
import {
  getCytobands,
  getRefNameAliases,
} from './utils/assemblyAliasesAndCytobands.ts'

if (process.argv.length !== 5) {
  console.error(
    'Usage: node createAssembly.ts <assemblyName> <listJsonPath> <dbDir>',
  )
  process.exit(1)
}

const assemblyName = requireArg(process.argv[2], 'assemblyName is required')
const list = requireArg(process.argv[3], 'listJsonPath is required')
const dbDir = requireArg(process.argv[4], 'dbDir is required')

const getBigDataLink = (j: string) =>
  `https://hgdownload.soe.ucsc.edu/goldenPath/${assemblyName}/bigZips/${j}`

const refNameAliases = getRefNameAliases(assemblyName, dbDir)
const cytobands = getCytobands(assemblyName, dbDir)

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
          ...(refNameAliases ? { refNameAliases } : {}),
          ...(cytobands ? { cytobands } : {}),
        },
      ],
      tracks: [],
    },
    null,
    2,
  ),
)

export {}
