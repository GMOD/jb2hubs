// The lanes each curated HPRC locus opens, read from the published
// structural-state sidecar: one per form a meaningful share of haplotypes
// carries in the launch window, commonest first.
//
// The rules are `structuralForms` (pangenomeSvStates.ts) and `structuralPanel`
// (pangenomePanels.ts), which is also what a region typed on the page goes
// through, so the table's launches and an arbitrary window cannot disagree.
// This used to read the 2.3 GB callset with bcftools, at five seconds a locus,
// and to apply a filter that hid a locus's own variation wherever vcfbub had
// removed a parent snarl — HP's panel was 457 against 5 and is now 260 / 184 /
// the rest.
//
// Not wired into the build: it needs the network. The output is committed at
// `public/pangenome-hprc/panels.json`; re-run it when a locus window moves or
// `buildHprcSvStates.sh` republishes the sidecar:
//   node generatePangenomePanels.ts
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import hprcConfig from './pangenome-config/hprc-grch38.json' with { type: 'json' }
import {
  HPRC_DATASET,
  HPRC_GRAPH_BROWSER,
} from './src/components/pangenomeDataset.ts'
import { launchRegion } from './src/components/pangenomeLinks.ts'
import {
  annotatedHaplotypes,
  structuralPanel,
} from './src/components/pangenomePanels.ts'
import { structuralForms } from './src/components/pangenomeSvStates.ts'
import { openSvStates } from './src/components/pangenomeSvStatesFile.ts'

import type { StructuralPanel } from './src/components/pangenomePanels.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, 'public/pangenome-hprc/panels.json')

const source = HPRC_DATASET.svStatesUrl!
const query = openSvStates(source)
// A lane with no gene track reads "no annotation", so where a form has a
// member with one, that member stands for it.
const annotated = annotatedHaplotypes(
  hprcConfig,
  HPRC_GRAPH_BROWSER.haplotypeLanesTrackId!,
)
const withoutGenes = new Set(
  (HPRC_DATASET.haplotypesWithoutGenes ?? []).filter(h => !annotated.has(h)),
)

const panels: Record<string, StructuralPanel> = {}
for (const locus of HPRC_DATASET.loci) {
  const region = launchRegion(locus)
  const { haplotypes, rows } = await query(
    region.chrom,
    region.start,
    region.end,
  )
  const forms = structuralForms(rows, haplotypes)
  const panel = structuralPanel(forms, { withoutGenes })
  console.log(
    `${locus.id.padEnd(9)} ${region.chrom}:${region.start}-${region.end} ` +
      `${forms.sites} records, ${forms.informative} informative, ` +
      (panel
        ? `${panel.forms} forms, ${panel.lanes.length} lanes: ${panel.lanes
            .map(l => `${l.haplotype} (${l.shares})`)
            .join(' ')}`
        : 'nothing tells the haplotypes apart'),
  )
  if (panel) {
    panels[locus.id] = panel
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      dataset: 'hprc',
      source,
      generated: new Date().toISOString().slice(0, 10),
      panels,
    },
    null,
    2,
  )}\n`,
)
console.log(`\nWrote ${Object.keys(panels).length} panels to ${OUT}`)
