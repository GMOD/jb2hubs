// Print one BED12 gene model per gene from an HPRC CAT GFF3, unsorted, for
// `pangenome-config/buildHprcGenes.sh` to sort, bgzip and index, and a summary
// of what it dropped to stderr. The rules are
// `src/components/pangenomeGeneModels.ts`. With a walk file it cuts the graph
// over each stacked gene's GRCh38 span to find where the haplotype's walk
// crosses it, and with `generatePangenomeLocusGenes.ts`'s output it adds the
// haplotype's genes GRCh38's primary assembly lacks.
//   node generatePangenomeGeneModels.ts <cat.gff3.gz> <gencode.v48.gff3.gz>
//     [--walks <GRCh38.walks.bed.gz> --haplotype HG00097#1]
//     [--locus-genes <locus-genes.jsonl> --haplotype HG00097#1]
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { parseArgs } from 'util'
import zlib from 'zlib'

import { TabixIndexedFile } from '@gmod/tabix'
import {
  RegionTooLargeError,
  WALK_BUDGETS,
  WalkReader,
  panSNContig,
  panSNHaplotype,
  walksKept,
} from '@jbrowse/graph-walks'
import { LocalFile } from 'generic-filehandle2'

import {
  MAX_GENE_SPAN,
  bed12,
  catGeneModelReader,
  referenceReader,
} from './src/components/pangenomeGeneModels.ts'
import { mergeLocusModels } from './src/components/pangenomeLocusGenes.ts'

import type {
  Placements,
  Reference,
} from './src/components/pangenomeGeneModels.ts'
import type { LocusModel } from './src/components/pangenomeLocusGenes.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    walks: { type: 'string' },
    'locus-genes': { type: 'string' },
    haplotype: { type: 'string' },
  },
})
const [input, gencode] = positionals
const locusGenes = values['locus-genes']
if (
  !input ||
  !gencode ||
  (!values.walks && !locusGenes) !== !values.haplotype
) {
  throw new Error(
    'usage: node generatePangenomeGeneModels.ts <cat.gff3.gz> <gencode.v48.gff3.gz> [--walks <walks.bed.gz>] [--locus-genes <locus-genes.jsonl>] [--haplotype <sample#hap>]',
  )
}

let tooLarge = 0

const gunzipLines = (file: string) =>
  readline.createInterface({
    input: fs.createReadStream(file).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  })

async function place(
  walksFile: string,
  haplotype: string,
  sources: string[],
  reference: Reference,
) {
  const walks = new WalkReader(
    new TabixIndexedFile({
      filehandle: new LocalFile(walksFile),
      tbiFilehandle: new LocalFile(`${walksFile}.tbi`),
    }),
  )
  if (!(await walks.header()).haplotypes.includes(haplotype)) {
    return undefined
  }
  const placements: Placements = new Map()
  for (const source of sources) {
    const r = reference.get(source)
    const refName = r && (await walks.sequenceFor('GRCh38', r.refName))
    if (!r || !refName) {
      continue
    }
    try {
      const span = { start: r.start, end: r.end }
      const { fragments } = await walks.cut(refName, span, {
        keep: walksKept([haplotype], refName),
        context: 0,
        links: false,
        expand: () => true,
        ...WALK_BUDGETS,
      })
      placements.set(
        source,
        fragments
          .filter(f => panSNHaplotype(f.name) === haplotype)
          .map(f => ({
            refName: panSNContig(f.name),
            start: f.hapStart,
            end: f.hapEnd,
          })),
      )
    } catch (error) {
      if (!(error instanceof RegionTooLargeError)) {
        throw error
      }
      tooLarge++
    }
  }
  return placements
}

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
const sources = reader.stackedSources()
const placements =
  values.walks && values.haplotype
    ? await place(
        values.walks,
        values.haplotype,
        sources,
        reference.transcripts,
      )
    : undefined
const {
  models: catModels,
  unnamed,
  tooLong,
  stacked,
} = reader.finish(placements)
const locusModels = locusGenes
  ? fs
      .readFileSync(locusGenes, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as { haplotype: string; model: LocusModel })
      .filter(row => row.haplotype === values.haplotype)
      .map(row => row.model)
  : []
const models = mergeLocusModels(catModels, locusModels)
for (const t of models) {
  process.stdout.write(`${bed12(t)}\n`)
}
process.stderr.write(
  `  ${path.basename(input)}: ${models.length} genes; dropped ${unnamed} unnamed, ${tooLong} over ${MAX_GENE_SPAN / 1e6} Mb, ${stacked} stacked on another gene` +
    (placements
      ? `; the graph placed ${placements.size} of ${sources.length} stacked sources` +
        (tooLarge ? `, ${tooLarge} too large to cut` : '')
      : values.walks
        ? `; the graph holds no walk of ${values.haplotype}`
        : '') +
    (locusGenes
      ? `; added ${locusModels.length} locus genes in place of ${catModels.length + locusModels.length - models.length} CAT models`
      : '') +
    '\n',
)
