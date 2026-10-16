// Print one BED12 gene model per gene from an HPRC CAT GFF3, unsorted, for
// `pangenome-config/buildHprcGenes.sh` to sort, bgzip and index, and a summary
// of what it dropped to stderr. The rules are
// `src/components/pangenomeGeneModels.ts`.
//   node generatePangenomeGeneModels.ts <cat.gff3.gz> <gencode.v48.gff3.gz>
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import zlib from 'zlib'

import {
  MAX_GENE_SPAN,
  bed12,
  catGeneModelReader,
  referenceReader,
} from './src/components/pangenomeGeneModels.ts'

const [input, gencode] = process.argv.slice(2)
if (!input || !gencode) {
  throw new Error(
    'usage: node generatePangenomeGeneModels.ts <cat.gff3.gz> <gencode.v48.gff3.gz>',
  )
}

const gunzipLines = (file: string) =>
  readline.createInterface({
    input: fs.createReadStream(file).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  })

const reference = referenceReader()
for await (const line of gunzipLines(gencode)) {
  reference.add(line)
}
if (![...reference.transcripts.values()].some(t => t.canonical)) {
  throw new Error(`${gencode} tags no transcript Ensembl_canonical`)
}
const reader = catGeneModelReader(reference.transcripts)
for await (const line of gunzipLines(input)) {
  reader.add(line)
}
const { models, unnamed, tooLong, stacked } = reader.finish()
for (const t of models) {
  process.stdout.write(`${bed12(t)}\n`)
}
process.stderr.write(
  `  ${path.basename(input)}: ${models.length} genes; dropped ${unnamed} unnamed, ${tooLong} over ${MAX_GENE_SPAN / 1e6} Mb, ${stacked} stacked on another gene\n`,
)
