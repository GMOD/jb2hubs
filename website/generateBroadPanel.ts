// Experiment: what does a protein panel look like when it is NOT filtered to the
// 13 COMMON_SPECIES? Takes NCBI's ortholog report in its own order — which is
// already model-organism-first and broadens outward — keeps the ones whose
// assembly we host, caps at MAX_ROWS, and writes the result into
// proteinExamples.json so /protein-browser renders it with no code change.
//
// Run: node generateBroadPanel.ts [GENE] [MAX_ROWS]
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { fetchOrthologReports } from './src/components/ncbiFetch.ts'
import { resolveGeneId } from './src/components/orthologSet.ts'
import {
  alignProteinPanel,
  assembleProteinPanel,
} from './src/components/proteinMsa.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const GENE = process.argv[2] ?? 'TP53'
const MAX_ROWS = Number(process.argv[3] ?? 60)
const REF_TAXON = 9606
const INDEX = 'https://genomes.jbrowse.org/ortholog_index.json'

// taxId -> hosted, from the site's own assembly index. Every row of the panel
// should be a genome someone can actually open.
async function hostedTaxa() {
  const idx = (await fetch(INDEX).then(r => r.json())) as Record<
    string,
    [string, string, number, string?]
  >
  return new Set(Object.values(idx).map(e => e[2]))
}

const geneId = await resolveGeneId(GENE, REF_TAXON)
if (!geneId) {
  throw new Error(`no GeneID for ${GENE}`)
}

const [hosted, reports] = await Promise.all([
  hostedTaxa(),
  fetchOrthologReports<{ reports?: { gene?: { tax_id?: string | number } }[] }>(
    geneId,
  ),
])

// NCBI's order, hosted only, capped. No phylogeny sampling: the report already
// leads with the model organisms and broadens outward.
const taxa: number[] = []
for (const { gene } of reports.reports ?? []) {
  const taxId = Number(gene?.tax_id)
  if (Number.isFinite(taxId) && hosted.has(taxId) && !taxa.includes(taxId)) {
    taxa.push(taxId)
  }
  if (taxa.length >= MAX_ROWS) {
    break
  }
}
console.log(
  `${GENE}: ${reports.reports?.length ?? 0} orthologs -> ${taxa.length} hosted, capped at ${MAX_ROWS}`,
)

const panel = await assembleProteinPanel(GENE, REF_TAXON, {
  taxa,
  onProgress: m => {
    console.log(`  ${m}`)
  },
})
console.log(`  panel: ${panel.rows.length} species`)

const alignment = await alignProteinPanel(panel, {
  onProgress: m => {
    console.log(`  ${m}`)
  },
})

const outPath = path.join(__dirname, 'public/proteinExamples.json')
const existing = fs.existsSync(outPath)
  ? (JSON.parse(fs.readFileSync(outPath, 'utf8')) as Record<string, unknown>)
  : {}
existing[`${GENE}:${REF_TAXON}`] = { panel, alignment }
fs.writeFileSync(outPath, JSON.stringify(existing))
console.log(`wrote ${panel.rows.length}-species ${GENE} to ${outPath}`)
