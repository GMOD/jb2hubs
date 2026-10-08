// Restore the parent snarls vcfbub removed from the HPRC wave callset, and
// split each no call by whether a snarl above it calls the haplotype, for
// `pangenome-config/buildHprcSvStates.sh`. The state rules are
// `src/components/pangenomeSvStates.ts`.
//
// stdin, the packed wave rows of `generatePangenomeSvStates.ts`:
//   chrom start end id lv ps states genotypes deltas
// <parents.tsv>, the raw callset's record of each removed ancestor, with
// allele lengths in place of sequences:
//   CHROM POS ID LV PS refLength altLengths [GT per sample]
// stdout, the sidecar's rows, unsorted:
//   chrom start end id states genotypes
// stderr, one line of counts:
//   restored dropped placed unplaced
//
//   node restorePangenomeSvStates.ts <samples.txt> <parents.tsv> <rows.tsv
import fs from 'fs'
import readline from 'readline'

import {
  MIN_CARRIERS,
  MISSING_STATE,
  PLACED_STATE,
  ancestorChain,
  markPlaced,
  packResidual,
  parseParent,
} from './src/components/pangenomeSvStates.ts'

import type {
  Deltas,
  ParentRecord,
} from './src/components/pangenomeSvStates.ts'

const [samplesFile, parentsFile] = process.argv.slice(2)
if (!samplesFile || !parentsFile) {
  throw new Error(
    'usage: node restorePangenomeSvStates.ts <samples.txt> <parents.tsv>',
  )
}
const samples = fs.readFileSync(samplesFile, 'utf8').trim().split('\n')
const kept = samples.flatMap((s, i) => (s === 'CHM13' ? [] : [i]))

const parents = new Map(
  fs
    .readFileSync(parentsFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const parent = parseParent(line, kept)
      return [parent.id, parent] as const
    }),
)

// A parent fewer than MIN_CARRIERS haplotypes are called at is no row: defb's
// 5.2 Mb one calls 1 of 462.
const restorable = (p: ParentRecord) =>
  p.deltas.filter(d => d !== undefined).length >= MIN_CARRIERS

const explained = new Map<ParentRecord, number[]>()

// What a row's haplotypes carry comes out of the nearest restored row above.
function explain(above: ParentRecord[], deltas: Deltas) {
  const nearest = above.find(restorable)
  if (nearest) {
    const sums = explained.get(nearest) ?? deltas.map(() => 0)
    deltas.forEach((delta, i) => {
      sums[i]! += delta ?? 0
    })
    explained.set(nearest, sums)
  }
}

const count = (text: string, state: string) => text.split(state).length - 1
let placed = 0
let unplaced = 0

function write(
  row: { chrom: string; start: number; end: number; id: string },
  states: string,
  packed: string,
  above: ParentRecord[],
) {
  const genotypes = markPlaced(
    packed,
    above.map(p => p.deltas),
  )
  placed += count(genotypes, PLACED_STATE)
  unplaced += count(genotypes, MISSING_STATE)
  process.stdout.write(
    `${row.chrom}\t${row.start}\t${row.end}\t${row.id}\t${states}\t${genotypes}\n`,
  )
}

const used = new Set<ParentRecord>()
for await (const line of readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})) {
  const [chrom, start, end, id, , ps, states, genotypes, deltas] =
    line.split('\t')
  const above = ancestorChain(ps!, parents)
  for (const p of above) {
    used.add(p)
  }
  if (above.length > 0) {
    explain(
      above,
      deltas!.split(',').map(d => (d === '' ? undefined : Number(d))),
    )
  }
  write(
    { chrom: chrom!, start: Number(start), end: Number(end), id: id! },
    states!,
    genotypes!,
    above,
  )
}

for (const parent of used) {
  if (restorable(parent)) {
    explain(ancestorChain(parent.parent, parents), parent.deltas)
  }
}
let restored = 0
for (const parent of used) {
  if (restorable(parent)) {
    restored += 1
    const { states, genotypes } = packResidual(
      parent.deltas,
      explained.get(parent) ?? parent.deltas.map(() => 0),
    )
    write(parent, states, genotypes, ancestorChain(parent.parent, parents))
  }
}
process.stderr.write(
  `${restored}\t${used.size - restored}\t${placed}\t${unplaced}\n`,
)
