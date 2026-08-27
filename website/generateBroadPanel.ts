// Precomputes the ortholog protein panels behind the example chips on
// /protein-browser, so a chip click renders the domain cartoon with no NCBI wait.
//
//   node generateBroadPanel.ts --genes TP53,BRCA2 [--ref 9606] [--rows 60] [--align]
//
// It calls exactly what the page calls with exactly the page's defaults, so a
// cached chip and a typed gene resolve the same panel — the selection rules live
// in assembleProteinPanel, not here. Merges into proteinExamples.json rather than
// rewriting it, so one gene can be rebuilt without taking the others out.
//
// It used to additionally keep only species whose assembly this site hosts,
// which is why it no longer does: no panel row is a link to a genome (the launch
// comes off the query gene's own structure), and the filter changes almost
// nothing anyway. Measured 2026-08-27, TP53's 658 orthologs include 652 hosted,
// and across 18 genes on 9 reference species the first 60 in NCBI's order held
// 0 or 1 unhosted species. A browser would have paid the 4.3 MB ortholog index
// to learn that, which is the reason the live path could not have matched.
//
// --align adds the EBI Clustal Omega pass, which is minutes per gene against
// seconds for the panel. Skip it while surveying: the cartoon needs phase 1 only.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  MAX_PANEL_ROWS,
  alignProteinPanel,
  alignedRows,
  assembleProteinPanel,
} from './src/components/proteinMsa.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function flag(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

const GENES = (flag('genes', 'TP53') ?? '').split(',').filter(Boolean)
const MAX_ROWS = Number(flag('rows', String(MAX_PANEL_ROWS)))
const REF_TAXON = Number(flag('ref', '9606'))
const ALIGN = process.argv.includes('--align')
const OUT = path.join(__dirname, 'public/proteinExamples.json')

const out: Record<string, unknown> = fs.existsSync(OUT)
  ? (JSON.parse(fs.readFileSync(OUT, 'utf8')) as Record<string, unknown>)
  : {}

for (const gene of GENES) {
  try {
    const panel = await assembleProteinPanel(gene, REF_TAXON, {
      maxRows: MAX_ROWS,
      onProgress: m => {
        console.log(`  ${m}`)
      },
    })
    const alignment = ALIGN ? await alignProteinPanel(panel) : undefined
    out[`${gene}:${REF_TAXON}`] = alignment ? { panel, alignment } : { panel }
    fs.writeFileSync(OUT, JSON.stringify(out))
    const domains = new Set(panel.rows.flatMap(r => r.domains.map(d => d.name)))
    console.log(
      `${gene}: ${panel.rows.length} of ${panel.query.total} species, ${domains.size} distinct domains${
        alignment ? `, aligned ${alignedRows(panel).length}` : ''
      }\n`,
    )
  } catch (e) {
    console.log(`  !! ${gene}: ${e instanceof Error ? e.message : String(e)}\n`)
  }
}
console.log(`wrote ${OUT}`)
