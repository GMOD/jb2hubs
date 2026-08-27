// Builds broad ortholog protein panels — NOT filtered to the 13 COMMON_SPECIES.
// Takes NCBI's ortholog report in its own order (already model-organism-first,
// broadening outward), keeps the ones whose assembly we host, caps at --rows,
// and writes into proteinExamples.json so /protein-browser renders it.
//
//   node generateBroadPanel.ts --genes TP53,BRCA2 --rows 60 [--align]
//
// --align adds the EBI Clustal Omega pass. Skip it while surveying: the domain
// cartoon needs phase 1 only, and phase 2 is minutes per gene.
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

function flag(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}

const GENES = (flag('genes', 'TP53') ?? '').split(',').filter(Boolean)
const MAX_ROWS = Number(flag('rows', '60'))
const REF_TAXON = Number(flag('ref', '9606'))
const ALIGN = process.argv.includes('--align')
const OUT = path.join(__dirname, 'public/proteinExamples.json')
const INDEX = 'https://genomes.jbrowse.org/ortholog_index.json'

// taxId -> hosted, from the site's own assembly index. Every row of a panel
// should be a genome someone can actually open.
let hostedPromise: Promise<Set<number>> | undefined
function hostedTaxa() {
  hostedPromise ??= fetch(INDEX)
    .then(r => r.json() as Promise<Record<string, [string, string, number]>>)
    .then(idx => new Set(Object.values(idx).map(e => e[2])))
  return hostedPromise
}

interface OrthologReports {
  reports?: { gene?: { tax_id?: string | number; taxname?: string } }[]
}

async function buildOne(gene: string) {
  const geneId = await resolveGeneId(gene, REF_TAXON)
  if (!geneId) {
    throw new Error(`no GeneID for ${gene}`)
  }
  const [hosted, reports] = await Promise.all([
    hostedTaxa(),
    fetchOrthologReports<OrthologReports>(geneId),
  ])
  const all = reports.reports ?? []

  const taxa: number[] = []
  for (const { gene: g } of all) {
    const taxId = Number(g?.tax_id)
    if (Number.isFinite(taxId) && hosted.has(taxId) && !taxa.includes(taxId)) {
      taxa.push(taxId)
    }
    if (taxa.length >= MAX_ROWS) {
      break
    }
  }
  const hostedTotal = all.filter(({ gene: g }) =>
    hosted.has(Number(g?.tax_id)),
  ).length
  console.log(
    `${gene}: ${all.length} orthologs, ${hostedTotal} hosted -> taking ${taxa.length}`,
  )

  const panel = await assembleProteinPanel(gene, REF_TAXON, { taxa })
  const alignment = ALIGN ? await alignProteinPanel(panel) : undefined
  return { panel, alignment, orthologTotal: all.length, hostedTotal }
}

const out: Record<string, unknown> = fs.existsSync(OUT)
  ? (JSON.parse(fs.readFileSync(OUT, 'utf8')) as Record<string, unknown>)
  : {}

for (const gene of GENES) {
  try {
    const { panel, alignment, orthologTotal, hostedTotal } =
      await buildOne(gene)
    out[`${gene}:${REF_TAXON}`] = alignment ? { panel, alignment } : { panel }
    fs.writeFileSync(OUT, JSON.stringify(out))
    const domains = new Set(panel.rows.flatMap(r => r.domains.map(d => d.name)))
    console.log(
      `  -> ${panel.rows.length} rows, ${domains.size} distinct domains (of ${orthologTotal} orthologs, ${hostedTotal} hosted)\n`,
    )
  } catch (e) {
    console.log(`  !! ${gene}: ${e instanceof Error ? e.message : String(e)}\n`)
  }
}
console.log(`wrote ${OUT}`)
