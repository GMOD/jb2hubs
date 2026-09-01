import fs from 'fs'

import { readJSON, writeJSON } from './util.ts'

import type { UcscGenome, UcscGenomeList, UcscGenomeRaw } from './types.ts'

/**
 * Enriches each entry of UCSC's genome list in place.
 *
 * The object shape is deliberately preserved: later phases and
 * buildConfigs.ts both `jq '.ucscGenomes | to_entries[]'`
 * over the result. (An older docstring here claimed this converted the object
 * into an array, which it has never done.)
 *
 * What it adds is the entry's own key -- the raw API response identifies a
 * genome only by its position in the object, so an entry passed around on its
 * own could not say which db it was -- plus the two config urls the website and
 * the hubs plugin resolve a genome through.
 */
function transformGenomeList(inputPath: string, outputPath: string): void {
  const { ucscGenomes } = readJSON<{
    ucscGenomes: Record<string, UcscGenomeRaw>
  }>(inputPath)

  const transformed: UcscGenomeList = {
    ucscGenomes: Object.fromEntries(
      Object.entries(ucscGenomes).map(([key, value]): [string, UcscGenome] => [
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
  }

  writeJSON(outputPath, transformed)
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
