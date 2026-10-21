// Pack `bcftools query` rows of a callset into sidecar rows, for
// `pangenome-config/buildHprcSvStates.sh`, `buildBovineSvStates.sh` and
// `buildArabidopsisSvStates.sh` to filter, sort and index. The state rules are
// `src/components/pangenomeSvStates.ts`.
//
// stdin, one record per line, as the build scripts ask bcftools for it:
//   CHROM POS ID LV PS INV REF ALT [GT per sample]
// where INV is vcfwave's flag, or with --traversals the record's AT field.
// With --symbolic, REF is the record's ALEN, every allele's length with the
// reference's first, and POS the base before the change, as minigraph's
// merge2vcf writes its symbolic alleles; ALT is not read.
// stdout, keeping LV and PS for the script's top-level filter, and for a
// nested record each haplotype's size change, which
// `restorePangenomeSvStates.ts` takes out of the parent's:
//   chrom start end id lv ps states genotypes deltas
//
//   bcftools query ... | node generatePangenomeSvStates.ts [--haploid]
//     [--traversals] [--symbolic] <samples.txt>
import fs from 'fs'
import readline from 'readline'
import { parseArgs } from 'util'

import {
  calledDeltas,
  comparedColumns,
  invertedAlleles,
  packRecord,
} from './src/components/pangenomeSvStates.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    haploid: { type: 'boolean', default: false },
    traversals: { type: 'boolean', default: false },
    symbolic: { type: 'boolean', default: false },
  },
})
const [samplesFile] = positionals
if (!samplesFile) {
  throw new Error(
    'usage: node generatePangenomeSvStates.ts [--haploid] [--traversals] [--symbolic] <samples.txt>',
  )
}
const kept = comparedColumns(
  fs.readFileSync(samplesFile, 'utf8').trim().split('\n'),
)
const ploidy = values.haploid ? 1 : 2

for await (const line of readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})) {
  const f = line.split('\t')
  const [chrom, pos, id, lv, ps, inv, ref, alt] = f
  const calls = f.slice(8)
  const [refLength = 0, ...altLengths] = values.symbolic
    ? ref!.split(',').map(Number)
    : [ref!.length, ...alt!.split(',').map(a => a.length)]
  const record = {
    refLength,
    altLengths,
    calls: kept.map(i => calls[i]!),
    ploidy,
  }
  const { states, genotypes } = packRecord({
    ...record,
    // a flag prints as 1 when set and . when not
    inverted: values.traversals
      ? invertedAlleles(inv!)
      : inv !== '.' && inv !== '0' && inv !== '',
  })
  const start = values.symbolic ? Number(pos) : Number(pos) - 1
  const deltas = ps === '.' ? '' : calledDeltas(record).join(',')
  process.stdout.write(
    `${chrom}\t${start}\t${start + refLength}\t${id}\t${lv === '.' ? 0 : lv}\t${ps}\t${states}\t${genotypes}\t${deltas}\n`,
  )
}
