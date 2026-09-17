// Print one BED12 gene model per gene from an HPRC CAT GFF3, unsorted, for
// `pangenome-config/buildHprcGenes.sh` to sort, bgzip and index. The rules are
// `src/components/pangenomeGeneModels.ts`.
//   node generatePangenomeGeneModels.ts <cat.gff3.gz>
import fs from 'fs'
import readline from 'readline'
import zlib from 'zlib'

import {
  bed12,
  catGeneModelReader,
} from './src/components/pangenomeGeneModels.ts'

const [input] = process.argv.slice(2)
if (!input) {
  throw new Error('usage: node generatePangenomeGeneModels.ts <cat.gff3.gz>')
}

const reader = catGeneModelReader(t => {
  process.stdout.write(`${bed12(t)}\n`)
})
for await (const line of readline.createInterface({
  input: fs.createReadStream(input).pipe(zlib.createGunzip()),
  crlfDelay: Infinity,
})) {
  reader.add(line)
}
reader.finish()
