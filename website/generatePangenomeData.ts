/* eslint-disable no-console */
// Precompute per-locus HPRC pangenome variant summaries for the /pangenome
// explorer. Streams `tabix` over the remote HPRC minigraph-cactus GRCh38 VCF for
// each curated region and writes a compact JSON summary (allele-frequency
// distribution, variant-size histogram, variant-type counts, per-sample variant
// burden) to public/pangenome/<id>.vcfsummary.json plus a manifest.json.
//
// This is NOT wired into the build (`prebuild`/`generate`): it needs network +
// the `tabix` binary, and its outputs are committed so production builds stay
// offline. Re-run manually when the catalog or upstream data changes:
//   node generatePangenomeData.ts
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

import { PANGENOME_LOCI, locusRegion } from './src/components/pangenomeLoci.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'public/pangenome')

// tabix caches the downloaded remote .tbi into its cwd; keep that out of the repo.
const TABIX_OPTS = { cwd: os.tmpdir() }

const VCF_URL =
  'https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/release2/minigraph-cactus/hprc-v2.0-mc-grch38.wave.vcf.gz'

interface Bin {
  label: string
  count: number
}

// AF and size bins are fixed edges so every locus is directly comparable.
// Release 2 is 232 samples → up to 464 haplotypes, so the rarest observable AF is
// ~0.2% and the ≤2% bin now holds roughly the first nine haplotypes rather than
// the first one. Edges are unchanged from release 1 on purpose: they are what
// makes summaries comparable across loci, and the rare end is still where most
// pangenome variants sit.
const AF_BINS: { label: string; max: number }[] = [
  { label: '≤2%', max: 0.02 },
  { label: '2–5%', max: 0.05 },
  { label: '5–10%', max: 0.1 },
  { label: '10–25%', max: 0.25 },
  { label: '25–50%', max: 0.5 },
  { label: '≥50%', max: Infinity },
]

const SIZE_BINS: { label: string; max: number }[] = [
  { label: '1 bp', max: 1 },
  { label: '2–10bp', max: 10 },
  { label: '11–50bp', max: 50 },
  { label: '51–300bp', max: 300 },
  { label: '301bp–1kb', max: 1000 },
  { label: '1–10kb', max: 10000 },
  { label: '>10kb', max: Infinity },
]

// Display labels for the VCF's own vcfwave TYPE vocabulary (snp/mnp/ins/del/complex).
const TYPE_LABEL: Record<string, string> = {
  snp: 'SNV',
  mnp: 'MNV',
  ins: 'Insertion',
  del: 'Deletion',
  complex: 'Complex',
}

// Variant class. We are NOT inventing a classification: this VCF's own TYPE field
// (defined by vcfwave as snp/mnp/ins/del/complex) is the source of truth and we use
// it verbatim when present. But vcfwave only stamps TYPE on the ~21% of alleles it
// decomposed, leaving most records unstamped; for those we fall back to the standard
// REF/ALT length rule, which we verified reproduces vcfwave's TYPE exactly (100%
// agreement on stamped records). So the two paths are consistent, not competing —
// the fallback just extends the file's own scheme to the gaps.
function variantClass(ref: string, alt: string, type: string | undefined) {
  const fromField = type ? TYPE_LABEL[type.toLowerCase()] : undefined
  if (fromField) {
    return fromField
  }
  if (ref.length === 1 && alt.length === 1) {
    return 'SNV'
  }
  if (ref.length === alt.length) {
    return 'MNV'
  }
  return alt.length > ref.length ? 'Insertion' : 'Deletion'
}

// Variant length in bp: the VCF's LEN when present (verified identical to the
// derived value), else derived from REF/ALT (substituted span for equal-length,
// net length change otherwise).
function variantSize(ref: string, alt: string, len: number | undefined) {
  if (len !== undefined && !Number.isNaN(len)) {
    return len
  }
  if (ref.length === alt.length) {
    return ref.length
  }
  return Math.abs(alt.length - ref.length)
}

function binIndex(bins: { max: number }[], value: number) {
  const i = bins.findIndex(b => value <= b.max)
  return i === -1 ? bins.length - 1 : i
}

// Bin arrays are pre-filled with zeros, so any in-range index is defined.
function bump(arr: number[], i: number) {
  arr[i] = arr[i]! + 1
}

function infoValue(info: string, key: string) {
  const m = new RegExp(`(?:^|;)${key}=([^;]*)`).exec(info)
  return m ? m[1] : undefined
}

async function getSamples(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tabix', ['-H', VCF_URL], TABIX_OPTS)
    let out = ''
    proc.stdout.on('data', d => (out += d))
    proc.on('error', reject)
    proc.on('close', () => {
      const header = out.split('\n').find(l => l.startsWith('#CHROM'))
      resolve(header ? header.split('\t').slice(9) : [])
    })
  })
}

interface LocusSummary {
  id: string
  gene: string
  region: string
  ref: string
  source: string
  variantCount: number
  typeCounts: Record<string, number>
  afHistogram: Bin[]
  sizeHistogram: Bin[]
  sampleBurden: { sample: string; count: number }[]
}

async function summarizeLocus(
  locus: (typeof PANGENOME_LOCI)[number],
  samples: string[],
): Promise<LocusSummary> {
  const region = locusRegion(locus)
  const afCounts = AF_BINS.map(() => 0)
  const sizeCounts = SIZE_BINS.map(() => 0)
  const typeCounts: Record<string, number> = {}
  const burden = samples.map(() => 0)
  let variantCount = 0

  const proc = spawn('tabix', [VCF_URL, region], TABIX_OPTS)
  const rl = readline.createInterface({ input: proc.stdout })
  proc.stderr.on('data', d => process.stderr.write(d))

  for await (const line of rl) {
    if (!line || line.startsWith('#')) {
      continue
    }
    const cols = line.split('\t')
    const info = cols[7] ?? ''
    const ref = cols[3] ?? ''
    // First ALT allele; the wave VCF is biallelic per record so this is the variant.
    const alt = (cols[4] ?? '').split(',')[0] ?? ''
    variantCount++

    const af = parseFloat(infoValue(info, 'AF')?.split(',')[0] ?? '0')
    if (!Number.isNaN(af)) {
      bump(afCounts, binIndex(AF_BINS, af))
    }

    const lenStr = infoValue(info, 'LEN')?.split(',')[0]
    const len = lenStr === undefined ? undefined : Math.abs(parseInt(lenStr))
    bump(sizeCounts, binIndex(SIZE_BINS, variantSize(ref, alt, len)))

    const cls = variantClass(ref, alt, infoValue(info, 'TYPE')?.split(',')[0])
    typeCounts[cls] = (typeCounts[cls] ?? 0) + 1

    // Per-sample carrier count: any non-ref, non-missing allele in the GT.
    for (let i = 9; i < cols.length; i++) {
      const gt = cols[i] ?? ''
      if (gt && gt !== '.' && /[1-9]/.test(gt.split(':')[0] ?? '')) {
        bump(burden, i - 9)
      }
    }
  }

  await new Promise<void>(resolve =>
    proc.on('close', () => {
      resolve()
    }),
  )

  return {
    id: locus.id,
    gene: locus.gene,
    region,
    ref: 'GRCh38',
    source: 'HPRC minigraph-cactus v2.0 (release 2)',
    variantCount,
    typeCounts,
    afHistogram: AF_BINS.map((b, i) => ({
      label: b.label,
      count: afCounts[i]!,
    })),
    sizeHistogram: SIZE_BINS.map((b, i) => ({
      label: b.label,
      count: sizeCounts[i]!,
    })),
    sampleBurden: samples
      .map((sample, i) => ({ sample, count: burden[i]! }))
      .sort((a, b) => b.count - a.count),
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  console.log('Fetching sample list…')
  const samples = await getSamples()
  console.log(`${samples.length} samples`)

  const manifest: { id: string; gene: string; variantCount: number }[] = []
  for (const locus of PANGENOME_LOCI) {
    process.stdout.write(`  ${locus.id} (${locusRegion(locus)}) … `)
    const summary = await summarizeLocus(locus, samples)
    fs.writeFileSync(
      path.join(OUT_DIR, `${locus.id}.vcfsummary.json`),
      JSON.stringify(summary),
    )
    manifest.push({
      id: locus.id,
      gene: locus.gene,
      variantCount: summary.variantCount,
    })
    console.log(`${summary.variantCount} variants`)
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify({ samples, loci: manifest }, null, 2),
  )
  console.log(`Wrote ${manifest.length} summaries + manifest to ${OUT_DIR}`)
}

void main()
