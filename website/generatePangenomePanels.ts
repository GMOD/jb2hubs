// Derive, for every curated HPRC locus, the panel of haplotypes its lanes launch
// opens: one lane per structural configuration the callset finds in the launch
// window, most common first. The rule is `choosePanel` in
// `src/components/pangenomePanels.ts`; this script only reads the callset.
//
// It reads the same SV-tier records the variant lane draws (`SV_FILTER` in
// pangenomeLinks.ts, restated in bcftools' expression language), over the same
// window the lanes open on, so the lanes and the matrix agree on what a
// "structural site" is.
// Which member stands for a configuration reads the committed graph config:
// one with a gene track there, so rerun this after adding annotation tracks. bcftools reads the tabix index over HTTPS, so a locus
// costs one ranged read of the 2.3 GB file, about five seconds.
//
// Not wired into the build: it needs the network and bcftools. The output is
// committed at `public/pangenome-hprc/panels.json`; re-run it when a locus
// window moves or the callset release changes:
//   node generatePangenomePanels.ts
import { execFileSync } from 'child_process'
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
  choosePanel,
  splitGenotype,
} from './src/components/pangenomePanels.ts'

import type { HaplotypeGenotypes } from './src/components/pangenomePanels.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, 'public/pangenome-hprc/panels.json')

const vcf = HPRC_DATASET.graphVcf!.url

// `alleleLength(feature)>=50` in JBrowse is the longest allele of the record;
// bcftools has no single call for that, so REF and every ALT are asked
// separately. `LV=0` is the snarl-tree top level, as on the lane.
const FILTER = 'INFO/LV=0 && (STRLEN(REF)>=50 || STRLEN(ALT)>=50)'

// CHM13 is in the callset as a haploid column, and in the graph as a second
// reference sample rather than a lane, so it is not a panel candidate.
const annotated = annotatedHaplotypes(
  hprcConfig,
  HPRC_GRAPH_BROWSER.haplotypeLanesTrackId!,
)
if (annotated.size === 0) {
  throw new Error(
    'no lane haplotype has a gene track in hprc-grch38.json, so every lane would read "no annotation"',
  )
}

const samples = execFileSync('bcftools', ['query', '-l', vcf], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(s => s !== 'CHM13')

function genotypesAt(chrom: string, start: number, end: number) {
  const rows = execFileSync(
    'bcftools',
    [
      'query',
      '-r',
      `${chrom}:${start + 1}-${end}`,
      '-i',
      FILTER,
      '-f',
      `%POS[\t%SAMPLE=%GT]\n`,
      vcf,
    ],
    { encoding: 'utf8', maxBuffer: 1 << 28 },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
  const byHaplotype = new Map<string, (number | undefined)[]>(
    samples.flatMap(s => [
      [`${s}#1`, []],
      [`${s}#2`, []],
    ]),
  )
  for (const row of rows) {
    const calls = new Map(
      row
        .split('\t')
        .slice(1)
        .map(cell => cell.split('=') as [string, string]),
    )
    for (const s of samples) {
      const [h1, h2] = splitGenotype(calls.get(s) ?? '.')
      byHaplotype.get(`${s}#1`)!.push(h1)
      byHaplotype.get(`${s}#2`)!.push(h2)
    }
  }
  const genotypes: HaplotypeGenotypes[] = [...byHaplotype].map(
    ([haplotype, alleles]) => ({ haplotype, alleles }),
  )
  return { sites: rows.length, genotypes }
}

const panels: Record<string, ReturnType<typeof choosePanel>> = {}
for (const locus of HPRC_DATASET.loci) {
  const region = launchRegion(locus)
  const { sites, genotypes } = genotypesAt(
    region.chrom,
    region.start,
    region.end,
  )
  const panel = choosePanel(genotypes, { annotated })
  const summary = panel
    ? `${panel.configurations} configurations over ${panel.haplotypes} haplotypes, ${panel.lanes.length} lanes (${panel.lanes.filter(l => annotated.has(l.haplotype)).length} with genes): ` +
      panel.lanes.map(l => `${l.haplotype} (${l.shares})`).join(' ')
    : 'no structural sites'
  console.log(
    `${locus.id.padEnd(9)} ${region.chrom}:${region.start}-${region.end} ${sites} sites, ${summary}`,
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
      source: vcf,
      filter: FILTER,
      generated: new Date().toISOString().slice(0, 10),
      panels,
    },
    null,
    2,
  )}\n`,
)
console.log(`\nWrote ${Object.keys(panels).length} panels to ${OUT}`)
