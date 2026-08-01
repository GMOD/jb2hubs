/* eslint-disable no-console */
// Build a per-locus multi-haplotype DNA alignment (FASTA) + exon overlay (GFF)
// for the react-msaview panel, from the HPRC minigraph-cactus GRCh38 VCF.
//
// Approach (no large downloads): for each locus pick an exon-overlapping WINDOW-bp
// sub-window ranked by indel-weighted variation (so structural variation shows, not
// just conserved SNVs), fetch the GRCh38 reference window (UCSC API), tabix the HPRC
// VCF there, and reconstruct every sample haplotype by applying its genotypes to the
// reference. The reference row is the spine, so the alignment is column-locked:
// SNVs/MNVs substitute columns, deletions become gaps, and insertions add shared
// insertion columns. Because the reference row is ungapped GRCh38, exon overlay
// coordinates are just (genomicPos - windowStart). Outputs (committed) under
// public/pangenome/msa/.
//
// NOT wired into the build: needs network + tabix. Re-run manually:
//   node generatePangenomeMsa.ts
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

import { PANGENOME_LOCI } from './src/components/pangenomeLoci.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'public/pangenome/msa')
const TABIX_OPTS = { cwd: os.tmpdir() }

const VCF_URL =
  'https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/release2/minigraph-cactus/hprc-v2.0-mc-grch38.wave.vcf.gz'
const UCSC_API = 'https://api.genome.ucsc.edu'
const WINDOW = 800
// Skip windows containing a single insertion longer than this: the column-locked
// model emits one shared column per inserted base, so a multi-kb insertion balloons
// the alignment to tens of thousands of columns (one bad pick made defb 31k cols
// wide). Multi-kb SVs are the JBrowse/MAF launch's job; the inline panel shows the
// sequence-level variation that fits.
const INS_CAP = 1000

interface VcfRow {
  pos: number // 1-based genomic
  ref: string
  alts: string[]
  gts: string[] // one per sample, e.g. "0|1", "1", "."
}

function tabix(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tabix', args, TABIX_OPTS)
    let out = ''
    proc.stdout.on('data', d => (out += d))
    proc.stderr.on('data', d => process.stderr.write(d))
    proc.on('error', reject)
    proc.on('close', () => {
      resolve(out)
    })
  })
}

async function getSamples(): Promise<string[]> {
  const header = (await tabix(['-H', VCF_URL]))
    .split('\n')
    .find(l => l.startsWith('#CHROM'))
  return header ? header.split('\t').slice(9) : []
}

async function fetchRows(region: string): Promise<VcfRow[]> {
  const text = await tabix([VCF_URL, region])
  const rows: VcfRow[] = []
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) {
      continue
    }
    const c = line.split('\t')
    rows.push({
      pos: parseInt(c[1]!),
      ref: c[3]!,
      alts: c[4]!.split(','),
      gts: c.slice(9).map(g => g.split(':')[0] ?? '.'),
    })
  }
  return rows
}

// Variation richness of a window. Indels are weighted heavily over SNVs because
// they are the structural "headline" the panel exists to show; maxIns gates out
// windows with a single over-cap insertion.
function windowScore(rows: VcfRow[], w: number) {
  let nVar = 0
  let indel = 0
  let maxIns = 0
  for (const r of rows) {
    if (r.pos < w || r.pos >= w + WINDOW) {
      continue
    }
    nVar++
    for (const alt of r.alts) {
      const d = alt.length - r.ref.length
      if (d !== 0) {
        indel++
      }
      maxIns = Math.max(maxIns, d)
    }
  }
  return { score: nVar + 4 * indel, maxIns }
}

// Pick the WINDOW-bp sub-window for the inline alignment. The old ranking led with
// exon-overlap then *SNV* density, steering into conserved coding sequence, so
// structural loci landed on near-invariant windows. Now: still require exon overlap
// (so the gene + exon overlay are in view — multi-kb SVs are the JBrowse/MAF
// launch's job, not the inline panel's) but rank the eligible windows by
// indel-weighted variation, and skip any window with an over-cap insertion. If no
// exon-overlapping window qualifies, fall back to the richest window anywhere.
function densestWindow(
  rows: VcfRow[],
  start: number,
  end: number,
  exons: Exon[],
) {
  const overlapsExon = (w: number) =>
    exons.some(e => e.start < w + WINDOW && e.end > w)
  const requireExon = exons.length > 0
  let best = start
  let bestScore = -1
  let fallback = start
  let fallbackScore = -1
  for (let w = start; w < end; w += WINDOW / 2) {
    const { score, maxIns } = windowScore(rows, w)
    if (maxIns > INS_CAP) {
      continue
    }
    if (score > fallbackScore) {
      fallbackScore = score
      fallback = w
    }
    if ((!requireExon || overlapsExon(w)) && score > bestScore) {
      bestScore = score
      best = w
    }
  }
  return bestScore >= 0 ? best : fallback
}

async function fetchJsonRetry(url: string, attempts = 5): Promise<unknown> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`status ${res.status}`)
      }
      return await res.json()
    } catch (e) {
      if (i === attempts - 1) {
        throw e
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

async function fetchRef(chrom: string, start: number, end: number) {
  const json = (await fetchJsonRetry(
    `${UCSC_API}/getData/sequence?genome=hg38;chrom=${chrom};start=${start};end=${end}`,
  )) as { dna?: string }
  return (json.dna ?? '').toUpperCase()
}

interface Exon {
  gene: string
  start: number
  end: number
  strand: string
}

async function fetchExons(chrom: string, start: number, end: number) {
  const json = (await fetchJsonRetry(
    `${UCSC_API}/getData/track?genome=hg38;track=ncbiRefSeqSelect;chrom=${chrom};start=${start};end=${end}`,
  )) as Record<string, unknown>
  const items = (json.ncbiRefSeqSelect ?? []) as {
    name2?: string
    strand?: string
    exonStarts?: string
    exonEnds?: string
  }[]
  const exons: Exon[] = []
  for (const it of items) {
    const starts = (it.exonStarts ?? '').split(',').filter(Boolean).map(Number)
    const ends = (it.exonEnds ?? '').split(',').filter(Boolean).map(Number)
    for (let i = 0; i < starts.length; i++) {
      exons.push({
        gene: it.name2 ?? 'gene',
        start: starts[i]!,
        end: ends[i]!,
        strand: it.strand ?? '+',
      })
    }
  }
  return exons
}

// Reconstruct a column-locked MSA. cells[hap][refIdx] holds the base(s) aligned
// to that reference position; insertions[refIdx][hap] holds inserted bases after
// it. maxIns[refIdx] sets how many shared insertion columns to emit.
function buildMsa(
  ref: string,
  winStart: number,
  rows: VcfRow[],
  haps: { sample: string; allele: number }[],
) {
  const W = ref.length
  const cells = haps.map(() => ref.split(''))
  const ins = haps.map(() => new Map<number, string>())

  rows.forEach(r => {
    const vi = r.pos - 1 - winStart
    if (vi < 0 || vi >= W) {
      return
    }
    haps.forEach((hap, h) => {
      const a = r.gts[indexOfSample.get(hap.sample)!]
      const allele = a ? a.split(/[|/]/)[hap.allele] : undefined
      const g = allele && allele !== '.' ? parseInt(allele) : 0
      if (!g) {
        return
      }
      const alt = r.alts[g - 1]
      if (!alt) {
        return
      }
      const L = r.ref.length
      if (L === 1 && alt.length === 1) {
        cells[h]![vi] = alt // SNV
      } else if (alt.length === L) {
        for (let k = 0; k < L && vi + k < W; k++) {
          cells[h]![vi + k] = alt[k]! // MNV / equal-length substitution
        }
      } else if (alt.length < L && r.ref.startsWith(alt)) {
        // deletion: keep the retained prefix, gap the deleted suffix
        for (let k = 0; k < alt.length && vi + k < W; k++) {
          cells[h]![vi + k] = alt[k]!
        }
        for (let k = alt.length; k < L; k++) {
          if (vi + k < W) {
            cells[h]![vi + k] = '-'
          }
        }
      } else if (alt.length > L && alt.startsWith(r.ref)) {
        ins[h]!.set(vi + L - 1, alt.slice(L)) // insertion after the ref span
      } else {
        cells[h]![vi] = alt[0]! // complex non-anchored: anchor only (rare)
      }
    })
  })

  const maxIns = new Map<number, number>()
  ins.forEach(m => {
    m.forEach((s, i) => maxIns.set(i, Math.max(maxIns.get(i) ?? 0, s.length)))
  })

  // Render a row through the shared column model: per ref position emit the
  // cell, then pad that position's insertion columns to maxIns width.
  const render = (rowCells: string[], rowIns: Map<number, string>) => {
    let s = ''
    for (let i = 0; i < W; i++) {
      s += rowCells[i]
      const mi = maxIns.get(i)
      if (mi) {
        s += (rowIns.get(i) ?? '').padEnd(mi, '-')
      }
    }
    return s
  }

  // Reference row uses the unmodified ref cells but the SAME insertion columns
  // (all gaps), so every row stays column-locked and equal length.
  const refRow = render(ref.split(''), new Map())
  const seqs = haps.map((_, h) => render(cells[h]!, ins[h]!))
  return { refRow, seqs }
}

let indexOfSample: Map<string, number>

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const samples = await getSamples()
  indexOfSample = new Map(samples.map((s, i) => [s, i]))

  for (const locus of PANGENOME_LOCI) {
    process.stdout.write(`  ${locus.id} … `)
    const all = await fetchRows(`${locus.chrom}:${locus.start}-${locus.end}`)
    const locusExons = await fetchExons(locus.chrom, locus.start, locus.end)
    const winStart = densestWindow(all, locus.start, locus.end, locusExons)
    const winEnd = winStart + WINDOW
    const ref = await fetchRef(locus.chrom, winStart, winEnd)
    const rows = all.filter(r => r.pos > winStart && r.pos <= winEnd)

    // Build haplotype list: GRCh38 reference first, then each sample's haplotypes
    // that have a genotype in this window (ploidy from the first usable GT).
    const haps: { sample: string; allele: number }[] = []
    for (const s of samples) {
      const si = indexOfSample.get(s)!
      const example = rows.map(r => r.gts[si]).find(g => g && g !== '.')
      const ploidy = example ? example.split(/[|/]/).length : 1
      for (let a = 0; a < ploidy; a++) {
        haps.push({ sample: s, allele: a })
      }
    }

    const { refRow, seqs } = buildMsa(ref, winStart, rows, haps)
    const labels = ['GRCh38', ...haps.map(h => `${h.sample}.${h.allele + 1}`)]
    const allSeqs = [refRow, ...seqs]
    const fasta = labels.map((l, i) => `>${l}\n${allSeqs[i]}`).join('\n')
    fs.writeFileSync(path.join(OUT_DIR, `${locus.id}.fa`), fasta + '\n')

    // Exon overlay on the GRCh38 row (ungapped pos = genomic - winStart, 1-based).
    const exons = locusExons.filter(e => e.start < winEnd && e.end > winStart)
    const gffLines = ['##gff-version 3']
    exons.forEach((e, i) => {
      const s = Math.max(0, e.start - winStart)
      const en = Math.min(WINDOW, e.end - winStart)
      if (en > s) {
        gffLines.push(
          `GRCh38\tucsc\texon\t${s + 1}\t${en}\t.\t${e.strand}\t.\tID=GRCh38.exon${i + 1};Name=${e.gene}`,
        )
      }
    })
    fs.writeFileSync(
      path.join(OUT_DIR, `${locus.id}.exons.gff`),
      gffLines.join('\n') + '\n',
    )

    console.log(
      `${locus.chrom}:${winStart}-${winEnd}  ${haps.length} haplotypes  ${rows.length} variants  ${exons.length} exons`,
    )
  }
  console.log(
    `Wrote MSA + exon GFF for ${PANGENOME_LOCI.length} loci to ${OUT_DIR}`,
  )
}

void main()
