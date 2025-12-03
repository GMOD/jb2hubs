import fs from 'fs'

interface GenomeEntry {
  organism: string
  [key: string]: unknown
}

interface MainGenomesData {
  ucscGenomes: Record<string, GenomeEntry>
}

/**
 * Transforms the UCSC genomes list by converting the ucscGenomes object
 * into an array with enhanced metadata for each genome.
 */
function transformGenomeList(inputPath: string, outputPath: string): void {
  // Read the input file
  const mainGenomesData = JSON.parse(
    fs.readFileSync(inputPath, 'utf8'),
  ) as MainGenomesData

  // Transform the data

  // Convert back to object format

  // Write the transformed data back
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        ucscGenomes: Object.fromEntries(
          Object.entries(mainGenomesData.ucscGenomes).map(([key, value]) => [
            key,
            {
              ...value,
              id: key,
              name: key,
              accession: key,
              commonName: value.organism,
              jbrowseConfig: `https://jbrowse.org/ucsc/${key}/config.json`,
              jbrowseMinimalConfig: `https://jbrowse.org/ucsc/${key}/minimal.json`,
            },
          ]),
        ),
      },
      null,
      2,
    ),
  )
}

// CLI
if (process.argv.length < 4) {
  console.error('Usage: node transformGenomeList.ts <inputPath> <outputPath>')
  console.error('  inputPath: Path to the original list.json file')
  console.error('  outputPath: Path to write the transformed list.json')
  process.exit(1)
}

const inputPath = process.argv[2]!
const outputPath = process.argv[3]!

if (!fs.existsSync(inputPath)) {
  console.error(`Error: Input file does not exist: ${inputPath}`)
  process.exit(1)
}

transformGenomeList(inputPath, outputPath)
