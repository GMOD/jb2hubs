// Pack `bcftools query` rows of the HPRC callset into sidecar rows, for
// `pangenome-config/buildHprcSvStates.sh` to filter, sort and index. The state
// rules are `src/components/pangenomeSvStates.ts`.
//
// stdin, one record per line, as the build script asks bcftools for it:
//   CHROM POS ID LV PS INV REF ALT [GT per sample]
// stdout, keeping LV and PS for the script's top-level filter:
//   chrom start end id lv ps states genotypes
//
//   bcftools query ... | node generatePangenomeSvStates.ts <samples.txt>
import fs from 'fs'
import readline from 'readline'

import { packRecord } from './src/components/pangenomeSvStates.ts'

const [samplesFile] = process.argv.slice(2)
if (!samplesFile) {
  throw new Error('usage: node generatePangenomeSvStates.ts <samples.txt>')
}
// CHM13 is in the callset as a haploid column and in the graph as a second
// reference, not a haplotype anyone compares against the rest.
const samples = fs.readFileSync(samplesFile, 'utf8').trim().split('\n')
const kept = samples.flatMap((s, i) => (s === 'CHM13' ? [] : [i]))

for await (const line of readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})) {
  const f = line.split('\t')
  const [chrom, pos, id, lv, ps, inv, ref, alt] = f
  const calls = f.slice(8)
  const { states, genotypes } = packRecord({
    refLength: ref!.length,
    altLengths: alt!.split(',').map(a => a.length),
    // a flag prints as 1 when set and . when not
    inverted: inv !== '.' && inv !== '0' && inv !== '',
    calls: kept.map(i => calls[i]!),
  })
  const start = Number(pos) - 1
  process.stdout.write(
    `${chrom}\t${start}\t${start + ref!.length}\t${id}\t${lv === '.' ? 0 : lv}\t${ps}\t${states}\t${genotypes}\n`,
  )
}
