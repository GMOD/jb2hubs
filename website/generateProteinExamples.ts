// Precomputes the protein-alignment example genes (the chips on
// /protein-alignment) so a chip click renders the domain cartoon AND the full
// react-msaview alignment instantly, instead of waiting on live NCBI + EBI.
// Network-heavy (EBI Clustal Omega), so run manually when the examples change
// — it is deliberately not part of the per-build `generate` chain.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  alignProteinPanel,
  assembleProteinPanel,
} from './src/components/proteinMsa.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Must match EXAMPLES / the default reference in ProteinMsaExplorer.tsx.
const REF_TAXON = 9606
const GENES = ['TP53', 'BRCA2', 'EGFR', 'SOD1']

const out: Record<string, unknown> = {}
for (const gene of GENES) {
  console.log(`\n${gene}: assembling panel…`)
  const panel = await assembleProteinPanel(gene, REF_TAXON, {
    onProgress: m => {
      console.log(`  ${m}`)
    },
  })
  console.log(`  aligning ${panel.rows.length} proteins at EBI…`)
  const alignment = await alignProteinPanel(panel, {
    onProgress: m => {
      console.log(`  ${m}`)
    },
  })
  out[`${gene}:${REF_TAXON}`] = { panel, alignment }
  console.log(`  done (${panel.rows.length} species)`)
}

const outputPath = path.join(__dirname, 'public/proteinExamples.json')
fs.writeFileSync(outputPath, JSON.stringify(out))
console.log(`\nwrote ${outputPath}`)
