/* eslint-disable no-console */
// Build a per-locus guide tree (Newick) from the committed MSA FASTAs so the
// react-msaview panel clusters haplotypes by similarity instead of listing them
// in VCF order. UPGMA on p-distance (mismatches over columns where both rows are
// ungapped) — appropriate for these column-locked DNA haplotype alignments and
// fully deterministic.
//
// Derives from the .fa already in public/pangenome/msa/ (NO network, unlike the
// other generators), so re-run it whenever those alignments change:
//   node generatePangenomeMsaTree.ts
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MSA_DIR = path.join(__dirname, 'public/pangenome/msa')

interface Seq {
  label: string
  seq: string
}

function parseFasta(text: string): Seq[] {
  const seqs: Seq[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('>')) {
      seqs.push({ label: line.slice(1).trim(), seq: '' })
    } else if (seqs.length) {
      seqs[seqs.length - 1]!.seq += line.trim()
    }
  }
  return seqs
}

// Fraction of mismatching columns among those where neither row has a gap. When
// two rows share no ungapped column the distance is undefined, so use the max (1)
// to keep the matrix complete.
function pDistance(a: string, b: string): number {
  let diff = 0
  let comparable = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== '-' && b[i] !== '-') {
      comparable++
      if (a[i] !== b[i]) {
        diff++
      }
    }
  }
  return comparable > 0 ? diff / comparable : 1
}

interface Cluster {
  newick: string
  height: number
  size: number
}

function upgma(seqs: Seq[]): string {
  const n = seqs.length
  const clusters: (Cluster | null)[] = seqs.map(s => ({
    newick: s.label,
    height: 0,
    size: 1,
  }))
  const d = seqs.map((si, i) =>
    seqs.map((sj, j) => (i === j ? 0 : pDistance(si.seq, sj.seq))),
  )

  let active = n
  while (active > 1) {
    let mi = -1
    let mj = -1
    let min = Infinity
    for (let i = 0; i < n; i++) {
      if (clusters[i]) {
        for (let j = i + 1; j < n; j++) {
          if (clusters[j] && d[i]![j]! < min) {
            min = d[i]![j]!
            mi = i
            mj = j
          }
        }
      }
    }

    const ci = clusters[mi]!
    const cj = clusters[mj]!
    const h = min / 2
    // Branch length = node height minus child height; clamp tiny negatives from
    // float drift (identical haplotypes give height 0, branch length 0).
    const li = Math.max(0, h - ci.height)
    const lj = Math.max(0, h - cj.height)
    const merged: Cluster = {
      newick: `(${ci.newick}:${li.toFixed(5)},${cj.newick}:${lj.toFixed(5)})`,
      height: h,
      size: ci.size + cj.size,
    }

    // Weighted-average the merged cluster's distance to every other cluster.
    for (let k = 0; k < n; k++) {
      if (clusters[k] && k !== mi && k !== mj) {
        const nd =
          (ci.size * d[mi]![k]! + cj.size * d[mj]![k]!) / (ci.size + cj.size)
        d[mi]![k] = nd
        d[k]![mi] = nd
      }
    }

    clusters[mi] = merged
    clusters[mj] = null
    active--
  }

  return `${clusters.find(c => c)!.newick};`
}

function main() {
  const files = fs
    .readdirSync(MSA_DIR)
    .filter(f => f.endsWith('.fa'))
    .sort()
  for (const file of files) {
    const id = file.replace(/\.fa$/, '')
    const seqs = parseFasta(fs.readFileSync(path.join(MSA_DIR, file), 'utf8'))
    if (seqs.length < 2) {
      console.log(`  ${id}: only ${seqs.length} sequence(s), skipping tree`)
      continue
    }
    const newick = upgma(seqs)
    fs.writeFileSync(path.join(MSA_DIR, `${id}.nh`), newick + '\n')
    console.log(`  ${id}: ${seqs.length} haplotypes → ${id}.nh`)
  }
  console.log(`Wrote guide trees for ${files.length} loci to ${MSA_DIR}`)
}

main()
