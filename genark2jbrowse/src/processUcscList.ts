import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface UcscGenome {
  organism: string
  // Add other properties if known from list.json, otherwise they will be spread
  [key: string]: any
}

const ucscApiUrl = 'https://api.genome.ucsc.edu/list/ucscGenomes'
const outputPath = path.join(
  __dirname,
  '../../website/processedHubJson/ucsc.json',
)

try {
  const response = await fetch(ucscApiUrl)
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  const mainGenomesData: { ucscGenomes: Record<string, UcscGenome> } =
    await response.json()

  const transformedData = Object.entries(mainGenomesData.ucscGenomes).map(
    ([key, value]) => ({
      ...value,
      id: key,
      name: key,
      accession: key,
      commonName: value.organism,
      jbrowseConfig: `https://jbrowse.org/ucsc/${key}/config.json`,
    }),
  )

  // Ensure the output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  await fs.writeFile(
    outputPath,
    JSON.stringify(transformedData, null, 2),
    'utf8',
  )
  console.log(`Successfully processed UCSC list and saved to ${outputPath}`)
} catch (error) {
  console.error('Error processing UCSC list:', error)
  process.exit(1)
}
