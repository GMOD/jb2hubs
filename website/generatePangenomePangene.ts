/* eslint-disable no-console */
// Precompute per-locus gene presence/absence + copy-number matrices from the
// lh3/pangene human100 graph (Zenodo 10.5281/zenodo.8118576). The graph's W-lines
// are per-sample walks through gene nodes, so counting how often each curated
// marker gene appears in a sample's walks gives that sample's diploid copy number
// (0 = absent, e.g. RHD in Rh-negative haplotypes; >2 = amplified, e.g. AMY).
// Writes public/pangenome/<id>.pangene.json for each locus with pangeneGenes.
//
// NOT wired into the build: needs network + ~8MB download; outputs are committed.
//   node generatePangenomePangene.ts
import fs from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'
import { createGunzip } from 'zlib'
import { fileURLToPath } from 'url'

import { PANGENOME_LOCI } from './src/components/pangenomeLoci.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'public/pangenome')

const GFA_URL =
  'https://zenodo.org/records/14854301/files/human100-v1.1-a1.gfa.gz?download=1'
const CACHE = path.join(os.tmpdir(), 'pangene-human100-v1.1-a1.gfa.gz')

// References first, then samples alphabetically.
const REF_ORDER = ['GRCh38', 'CHM13']

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
  // counts: gene -> sample -> copy number (summed over haplotypes + contigs)
  const counts = new Map<string, Map<string, number>>()
  for (const g of targetGenes) {
    counts.set(g, new Map())
  }
  const samples = new Set<string>()

  const rl = readline.createInterface({
    input: fs.createReadStream(CACHE).pipe(createGunzip()),
  })
  for await (const line of rl) {
    if (line.charCodeAt(0) !== 87 /* 'W' */ || line[1] !== '\t') {
      continue
    }
    const f = line.split('\t')
    const sample = f[1]!
    const walk = f[6] ?? ''
    samples.add(sample)
    for (const token of walk.split(/[<>]/)) {
      const geneCounts = counts.get(token)
      if (geneCounts) {
        geneCounts.set(sample, (geneCounts.get(sample) ?? 0) + 1)
      }
    }
  }

  const orderedSamples = [
    ...REF_ORDER.filter(s => samples.has(s)),
    ...[...samples].filter(s => !REF_ORDER.includes(s)).sort(),
  ]

  let written = 0
  for (const locus of PANGENOME_LOCI) {
    if (!locus.pangeneGenes?.length) {
      continue
    }
    const genes = locus.pangeneGenes.filter(g => targetGenes.has(g))
    const matrix = genes.map(g => {
      const gc = counts.get(g)!
      return orderedSamples.map(s => gc.get(s) ?? 0)
    })
    fs.writeFileSync(
      path.join(OUT_DIR, `${locus.id}.pangene.json`),
      JSON.stringify({
        id: locus.id,
        source: 'lh3/pangene human100-v1.1',
        samples: orderedSamples,
        genes,
        matrix,
      }),
    )
    written++
    const present = genes.map(
      (g, i) =>
        `${g}:${matrix[i]!.filter(n => n > 0).length}/${orderedSamples.length}`,
    )
    console.log(`  ${locus.id}: ${present.join('  ')}`)
  }
  console.log(
    `Wrote ${written} pangene matrices (${orderedSamples.length} samples) to ${OUT_DIR}`,
  )
}

void main()
