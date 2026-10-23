// Write each graph's "Known alleles" track, `pangenome-config/<graph>/
// known-alleles.gff3`, from the alleles its dataset lists. `upload.sh`
// publishes it beside the graph's config, where every launch's session track
// names it; `pangenomeKnownAlleles.test.ts` fails when a file is stale.
//
//   node generatePangenomeKnownAlleles.ts
import fs from 'fs'
import path from 'path'

import { PANGENOME_DATASETS } from './src/components/pangenomeDataset.ts'
import {
  knownAllelesFile,
  knownAllelesGff3,
} from './src/components/pangenomeKnownAlleles.ts'

for (const dataset of PANGENOME_DATASETS) {
  const file = knownAllelesFile(dataset)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, knownAllelesGff3(dataset.knownAlleles))
  console.log(`wrote ${file}`)
}
