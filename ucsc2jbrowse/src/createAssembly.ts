import { checkIfFileAccessible } from './checkIfFileAccessible.ts'
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

const HGDOWNLOAD = 'https://hgdownload.soe.ucsc.edu'

const getBigDataLink = (j: string) =>
  `${HGDOWNLOAD}/goldenPath/${assemblyName}/bigZips/${j}`

// bigZips is where UCSC puts an assembly's downloadable files, and for almost
// every db the template above is simply right. The nib-era assemblies are the
// exception: UCSC never built them a bigZips 2bit, and theirs sits beside the
// browser's own data under /gbdb instead. rn3 is the live example — it is in
// api.genome.ucsc.edu/list/ucscGenomes with `nibPath: /gbdb/rn3/nib`, we built
// it a config, and its sequence url 404'd from the day it was generated. Nothing
// noticed for months, because no caller checked assembly-node urls at all.
//
// So derive, then confirm. A transient failure keeps the bigZips url (that is
// what checkIfFileAccessible returns on a timeout), which is the right way to be
// wrong: an hgdownload blip must not rewrite a working config to the fallback.
async function resolveSequenceFile(basename: string, gbdbName: string) {
  const bigZips = getBigDataLink(basename)
  if (
    await checkIfFileAccessible({
      url: bigZips,
      assembly: assemblyName,
      trackName: `${assemblyName} sequence`,
    })
  ) {
    return bigZips
  }
  const gbdb = `${HGDOWNLOAD}/gbdb/${assemblyName}/${gbdbName}`
  if (
    await checkIfFileAccessible({
      url: gbdb,
      assembly: assemblyName,
      trackName: `${assemblyName} sequence (gbdb fallback)`,
    })
  ) {
    console.error(`${assemblyName}: no bigZips ${basename}, using ${gbdb}`)
    return gbdb
  }
  // Neither resolves. Keep the canonical url rather than inventing one: an
  // assembly with no published sequence anywhere is a real upstream fact, and
  // checkTrackUrls.mjs is what should report it.
  console.error(`${assemblyName}: no 2bit at bigZips or gbdb`)
  return bigZips
}

const twoBitUri = await resolveSequenceFile(
  `${assemblyName}.2bit`,
  `${assemblyName}.2bit`,
)

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
              uri: twoBitUri,
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
