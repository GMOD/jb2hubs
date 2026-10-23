// Write the bovine graph's OMIA track, `pangenome-config/bovine-arsucd12/
// omia-variants.gff3`, from OMIA's current cattle variant table. `upload.sh`
// publishes it beside the graph config. Rerun to pick up OMIA's new entries.
//
//   node generatePangenomeOmia.ts
import fs from 'fs'

import { OMIA_CATTLE_CSV, omiaGff3 } from './src/components/pangenomeOmia.ts'

const OUT = 'pangenome-config/bovine-arsucd12/omia-variants.gff3'

// 225 of 309 placed on 2026-10-23; a table that places far fewer is a broken
// download, not a smaller OMIA.
const MIN_PLACED = 150

const response = await fetch(OMIA_CATTLE_CSV, {
  signal: AbortSignal.timeout(60_000),
})
if (!response.ok) {
  throw new Error(`OMIA answered ${response.status}`)
}
const { gff3, placed, skipped } = omiaGff3(await response.text())
if (placed < MIN_PLACED) {
  throw new Error(
    `OMIA placed only ${placed} variants (under ${MIN_PLACED}); not writing ${OUT}`,
  )
}
fs.writeFileSync(OUT, gff3)
console.log(
  `wrote ${OUT}: ${placed} variants; ${skipped.assembly} on another assembly, ${skipped.position} with no usable position`,
)
