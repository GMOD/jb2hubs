import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

import { myfetchtextWithRetry, writeIfChanged } from 'hubtools'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface UcscGenome {
  organism: string
  taxId: number
  // Other list.json fields are spread through to the output untouched
  [key: string]: unknown
}

const ucscApiUrl = 'https://api.genome.ucsc.edu/list/ucscGenomes'
const outputPath = path.join(
  __dirname,
  '../../website/processedHubJson/ucsc.json',
)

try {
  const mainGenomesData: { ucscGenomes: Record<string, UcscGenome> } =
    JSON.parse(await myfetchtextWithRetry(ucscApiUrl))

  const transformedData = Object.entries(mainGenomesData.ucscGenomes).map(
    ([key, value]) => ({
      ...value,
      id: key,
      name: key,
      accession: key,
      commonName: value.organism,
      // UCSC's API names this taxId; every other source (GenArk/NCBI) in
      // processedHubJson names it taxonId. Emit taxonId too so consumers
      // don't need to special-case UCSC entries.
      taxonId: value.taxId,
      jbrowseConfig: `https://jbrowse.org/ucsc/${key}/config.json`,
      jbrowseMinimalConfig: `https://jbrowse.org/ucsc/${key}/minimal.json`,
    }),
  )
  if (transformedData.length === 0) {
    throw new Error(`${ucscApiUrl} lists no genomes`)
  }

  const changed = writeIfChanged(
    outputPath,
    JSON.stringify(transformedData, null, 2),
  )
  console.log(`${changed ? 'Saved' : 'Kept'} UCSC list at ${outputPath}`)
} catch (error) {
  if (!fs.existsSync(outputPath)) {
    console.error('Error processing UCSC list:', error)
    process.exit(1)
  }
  console.error(`Warning: keeping the existing ${outputPath}:`, error)
}
