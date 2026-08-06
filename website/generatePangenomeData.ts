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

import { HPRC_DATASET } from './src/components/pangenomeDataset.ts'
import { PANGENOME_LOCI, locusRegion } from './src/components/pangenomeLoci.ts'

import type { LocusSummary } from './src/components/pangenomeData.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'public/pangenome')

// tabix caches the downloaded remote .tbi into its cwd; keep that out of the repo.
const TABIX_OPTS = { cwd: os.tmpdir() }

// Read from the dataset rather than restated, so the url the site launches and
// the url these summaries describe cannot drift apart.
const VCF_URL = HPRC_DATASET.graphVcf.url

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

// Does this GT carry any non-reference allele? Allele indices run past 9 here
// (one measured MHC record has 47 ALTs), so parse the fields rather than looking
// for a nonzero digit.
function carriesAlt(gt: string) {
  return gt
    .split(':')[0]!
    .split(/[|/]/)
    .some(a => a !== '.' && parseInt(a) > 0)
}

// One record is one variant site here, and no de-duplication is needed — which
// is worth stating, because the obvious reading of this file says otherwise.
// Most records carry LV>0 (over a measured 20 kb of MHC, 1,454 of 2,522), and
// `LV`/`PS` do describe vg's snarl tree, so it looks as though a nested child
// sits beside a parent record that also describes it. It does not: vcfwave
// REPLACES a complex record with its decomposition, keeping `PS` as provenance,
// and the parent is not written. Measured over 60 kb of MHC — 6,168 records —
// there is exactly one distinct `PS` value in the whole window and no record
// carries it as an ID. So filtering to `LV==0` here would not remove duplicates,
// it would delete real variants: over SMN it leaves 1 site of 11,553.
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
  let alleleCount = 0

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
    variantCount++

    // Every ALT, not just the first. This file is NOT biallelic per record, as
    // this loop used to assume: 222 of 2,522 records over a measured 20 kb of
    // MHC are multi-allelic, and one of them carries 47 ALTs whose LEN runs from
    // 270 bp to a 5,829 bp deletion — of which the old `[0]` indexing binned one
    // insertion and dropped the other 46 alleles. AF/LEN/TYPE are per-ALT arrays
    // (Number=A), so each is indexed alongside its own allele.
    const afs = infoValue(info, 'AF')?.split(',') ?? []
    const lens = infoValue(info, 'LEN')?.split(',') ?? []
    const types = infoValue(info, 'TYPE')?.split(',') ?? []

    ;(cols[4] ?? '').split(',').forEach((alt, ai) => {
      if (!alt || alt === '.' || alt === '*') {
        return
      }
      alleleCount++

      const af = parseFloat(afs[ai] ?? '0')
      if (!Number.isNaN(af)) {
        bump(afCounts, binIndex(AF_BINS, af))
      }

      const lenStr = lens[ai]
      const len = lenStr === undefined ? undefined : Math.abs(parseInt(lenStr))
      bump(sizeCounts, binIndex(SIZE_BINS, variantSize(ref, alt, len)))

      const cls = variantClass(ref, alt, types[ai])
      typeCounts[cls] = (typeCounts[cls] ?? 0) + 1
    })

    // Per-sample carriage: any non-ref, non-missing allele in the GT, counted
    // once per site whether het or hom.
    for (let i = 9; i < cols.length; i++) {
      const gt = cols[i] ?? ''
      if (gt && gt !== '.' && carriesAlt(gt)) {
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
    alleleCount,
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
    console.log(`${summary.variantCount} sites, ${summary.alleleCount} alleles`)
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify({ samples, loci: manifest }, null, 2),
  )
  console.log(`Wrote ${manifest.length} summaries + manifest to ${OUT_DIR}`)
}

void main()
