// Precompute per-locus gene copy-number matrices from the lh3/pangene human100
// graph (Zenodo 10.5281/zenodo.8118576). Each W-line is one *haplotype* walk
// (PanSN `sample hapIdx …`), so counting how often a marker gene appears in a
// haplotype's walks gives that haplotype's copy number (0 = absent, e.g. RHD on
// an Rh-negative haplotype; ≥2 = amplified, e.g. AMY1). Keying by haplotype — not
// by diploid sample — keeps the single-haplotype references (GRCh38#0, CHM13#0)
// directly comparable to each sample haplotype on one scale, which is how pangene
// itself represents gene content. Writes public/pangenome/<id>.pangene.json.
//
// NOT wired into the build: needs network + ~8MB download; outputs are committed.
//   node generatePangenomePangene.ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'
import { createGunzip } from 'zlib'

import { PANGENOME_LOCI } from './src/components/pangenomeLoci.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'public/pangenome')

const GFA_URL =
  'https://zenodo.org/records/14854301/files/human100-v1.1-a1.gfa.gz?download=1'
const CACHE = path.join(os.tmpdir(), 'pangene-human100-v1.1-a1.gfa.gz')

// Single-haplotype references first (PanSN hap 0), then sample haplotypes.
const REF_HAPLOTYPES = ['GRCh38#0', 'CHM13#0']

// The `refs` present in `items` (in `refs` order), followed by everything else
// sorted. Keeps the references pinned to the front of the matrix columns.
function refsFirst(items: Set<string>, refs: string[]) {
  const rest = [...items].filter(i => !refs.includes(i)).sort()
  return [...refs.filter(r => items.has(r)), ...rest]
}

async function ensureGfa() {
  if (fs.existsSync(CACHE) && fs.statSync(CACHE).size > 0) {
    return
  }
  console.log('Downloading pangene human100 graph…')
  const res = await fetch(GFA_URL)
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status}`)
  }
  fs.writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()))
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  await ensureGfa()

  const targetGenes = new Set(PANGENOME_LOCI.flatMap(l => l.pangeneGenes ?? []))
  // counts: gene -> haplotype (sample#hap) -> copy number on that haplotype
  // (summed across its contigs).
  const counts = new Map<string, Map<string, number>>()
  for (const g of targetGenes) {
    counts.set(g, new Map())
  }
  const haplotypes = new Set<string>()

  const rl = readline.createInterface({
    input: fs.createReadStream(CACHE).pipe(createGunzip()),
  })
  for await (const line of rl) {
    if (line.charCodeAt(0) !== 87 /* 'W' */ || line[1] !== '\t') {
      continue
    }
    const f = line.split('\t')
    const haplotype = `${f[1]}#${f[2]}` // PanSN sample#hapIdx
    const walk = f[6] ?? ''
    haplotypes.add(haplotype)
    for (const token of walk.split(/[<>]/)) {
      const geneCounts = counts.get(token)
      if (geneCounts) {
        geneCounts.set(haplotype, (geneCounts.get(haplotype) ?? 0) + 1)
      }
    }
  }

  const orderedHaplotypes = refsFirst(haplotypes, REF_HAPLOTYPES)
  // The references actually present, in order — emitted so the viewer never has to
  // hardcode reference names (keeps the matrix component graph-agnostic).
  const referenceHaplotypes = REF_HAPLOTYPES.filter(r => haplotypes.has(r))

  let written = 0
  for (const locus of PANGENOME_LOCI) {
    if (!locus.pangeneGenes?.length) {
      continue
    }
    const genes = locus.pangeneGenes.filter(g => targetGenes.has(g))
    const matrix = genes.map(g => {
      const gc = counts.get(g)!
      return orderedHaplotypes.map(h => gc.get(h) ?? 0)
    })
    fs.writeFileSync(
      path.join(OUT_DIR, `${locus.id}.pangene.json`),
      JSON.stringify({
        id: locus.id,
        source: 'lh3/pangene human100-v1.1',
        haplotypes: orderedHaplotypes,
        referenceHaplotypes,
        genes,
        matrix,
      }),
    )
    written++
    const present = genes.map(
      (g, i) =>
        `${g}:${matrix[i]!.filter(n => n > 0).length}/${orderedHaplotypes.length}`,
    )
    console.log(`  ${locus.id}: ${present.join('  ')}`)
  }
  console.log(
    `Wrote ${written} pangene matrices (${orderedHaplotypes.length} haplotypes) to ${OUT_DIR}`,
  )
}

void main()
