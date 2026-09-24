// Derive a pangenome's variable-locus catalogue from its own coarse tier,
// instead of curating one by hand.
//
// HPRC's 20 loci in `pangenomeLoci.ts` are hand-picked and carry
// hand-written prose, which is what makes them good and also what makes them
// unrepeatable: standing up a new pangenome meant a human reading the
// literature for that species. That does not generalise, and "some predefined
// demos" is a fair description of what it produces.
//
// It does not have to be that way, because the graph already knows where it
// varies. `build_bubble_tier.sh` (jbrowse-components) emits one node per
// top-level bubble with its segment count in a `cn:i:` tag, and that file is
// tiny -- 184 KB for mouse, 48 KB for cattle, against 174 MB and 50 MB for the
// bubbles files they are built from. Rank those by `cn`, name each by the genes
// it covers, and the result is a locus catalogue for any graph that has a tier,
// which is every graph the build scripts produce.
//
// VALIDATED AGAINST HUMAN CURATION BEFORE BEING TRUSTED, on both datasets,
// 2026-09-09:
//
//   mouse   the top 12 are the Vmn2r vomeronasal receptor clusters (chr7),
//           the Speer family (chr5), Dock2 (chr11), and an intergenic run at
//           chr12:113-116 Mb that is the Igh locus -- IG segments are not in
//           RefSeqSelect, which is why it comes back unnamed. Those are the
//           families a mouse geneticist would name as strain-hypervariable,
//           and nobody put them in a list.
//   bovine  #1 is the beta-defensin cluster (1,113 segments in one bubble),
//           and the top 10 contain FOUR of the five windows the hand-written
//           README beside the data calls "worth opening": BTNL2/BoLA,
//           RHOBTB2, RAET1L and SIGLECL1. The derivation reproduced most of a
//           human's list from the file itself.
//
// So the curated catalogue is now an OVERLAY, not the mechanism: HPRC keeps its
// prose because someone wrote it, and every other dataset gets this.
//
// Not wired into the build: it needs network. Outputs are committed.
//   node website/generatePangenomeLoci.ts <datasetId>
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import zlib from 'zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface Bubble {
  chrom: string
  start: number
  end: number
  segments: number
  shortest: number
  longest: number
  inversion: number
}

// Which datasets can be derived, and the two things that differ per dataset.
// `geneTrack` is NOT a constant: bosTau9 publishes no `ncbiRefSeqSelect`, only
// `ncbiRefSeq`/`ncbiRefSeqCurated`, so a hardcoded track name returns nothing
// and every locus comes back "(intergenic)" — which reads as a real answer.
const DATASETS = {
  mouse: {
    tier: 'https://jbrowse.org/demos/mouse_pangenome/mouse-mm39-minigraph.tier10000.segs.bed.gz',
    genome: 'mm39',
    geneTrack: 'ncbiRefSeqSelect',
  },
  bovine: {
    tier: 'https://jbrowse.org/demos/bovine_pangenome/bovine-arsucd12-minigraph.tier10000.segs.bed.gz',
    genome: 'bosTau9',
    geneTrack: 'ncbiRefSeqCurated',
  },
}

// The graph view lays a cut out to a target node size, so ten times the nodes is
// the same ink a tenth the size. `MAX_DETAIL_WINDOW_BP` in pangenomeLoci.ts is
// 150 kb for that reason, and the same ceiling applies to a derived locus: past
// it the entry is still worth listing (it IS where the graph varies) but it gets
// no graph launch, exactly as an over-wide curated locus does.
const MAX_DRAWABLE_BP = 150_000

// gfatools clamps a bubble's path count at INT32_MAX rather than overflowing,
// and every bubble at the top of this ranking is clamped — so `cw` carries no
// information precisely where the ranking is interesting, and `cn` is the metric.
const GFATOOLS_PATH_CLAMP = 2_147_483_647

function tagInt(tags: string, key: string) {
  const m = new RegExp(`${key}:i:(-?\\d+)`).exec(tags)
  return m ? Number(m[1]) : 0
}

async function readTier(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`)
  }
  const text = zlib
    .gunzipSync(Buffer.from(await res.arrayBuffer()))
    .toString('utf8')
  const bubbles: Bubble[] = []
  for (const line of text.split('\n')) {
    const f = line.split('\t')
    const tags = f[5]
    if (f.length < 6 || tags === undefined || !tags.includes('ct:Z:bubble')) {
      continue
    }
    bubbles.push({
      // stable names are PanSN (`mm39#0#chr1`); the last field is the refName
      // the reference assembly actually uses.
      chrom: f[0]!.split('#').at(-1)!,
      start: Number(f[1]),
      end: Number(f[2]),
      segments: tagInt(tags, 'cn'),
      shortest: tagInt(tags, 'cs'),
      longest: tagInt(tags, 'cl'),
      inversion: tagInt(tags, 'cv'),
    })
  }
  return bubbles
}

// Empty only when UCSC answered with an empty list. A failed request used to
// come back empty too, and was committed as an intergenic locus.
async function genesAt(
  genome: string,
  geneTrack: string,
  b: Bubble,
): Promise<string[]> {
  const url =
    `https://api.genome.ucsc.edu/getData/track?genome=${genome};` +
    `track=${geneTrack};chrom=${b.chrom};start=${b.start};end=${b.end}`
  let failure: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const items = ((await res.json()) as Record<string, unknown>)[geneTrack]
      if (!Array.isArray(items)) {
        throw new Error(`no ${geneTrack} list in the answer`)
      }
      return [
        ...new Set(
          items
            .map(i => (i as { name2?: string }).name2)
            .filter((n): n is string => typeof n === 'string' && n.length > 0),
        ),
      ].sort()
    } catch (e) {
      failure = e
    }
  }
  throw new Error(`${url}: ${String(failure)}`)
}

// A cluster is named for the family rather than for all of its members: the
// bovine defensin bubble covers 30-odd DEFB genes and listing them is not a
// name. Collapse a shared alphabetic prefix when three or more genes share one.
function labelFor(genes: string[]) {
  if (genes.length === 0) {
    return undefined
  }
  if (genes.length < 3) {
    return genes.join(', ')
  }
  // The stem is the gene name with its numbering removed, so DEFB, DEFB1,
  // DEFB10 and DEFB4A all reduce to DEFB. Taken from every gene rather than
  // parsed off the first: the first is alphabetically smallest, which for a
  // family is usually the unnumbered member (`DEFB`), and a regex requiring a
  // digit finds no prefix in it at all.
  const stems = new Map<string, number>()
  for (const g of genes) {
    const stem = /^([A-Za-z][A-Za-z-]{1,})/.exec(g)?.[1]
    if (stem !== undefined) {
      stems.set(stem, (stems.get(stem) ?? 0) + 1)
    }
  }
  const [stem, count] = [...stems].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  if (count >= 3 && stem.length >= 3) {
    return `${stem} cluster (${genes.length} genes)`
  }
  const rest = genes.length - 3
  return rest > 0
    ? `${genes.slice(0, 3).join(', ')} +${rest}`
    : genes.join(', ')
}

async function main() {
  const id = process.argv[2]
  const spec =
    id === undefined ? undefined : DATASETS[id as keyof typeof DATASETS]
  if (spec === undefined) {
    console.error(
      `usage: node generatePangenomeLoci.ts <${Object.keys(DATASETS).join('|')}>`,
    )
    process.exit(1)
  }
  const topN = Number(process.argv[3] ?? 25)

  console.log(`Reading ${spec.tier}`)
  const bubbles = await readTier(spec.tier)
  const clamped = bubbles.filter(b => b.segments >= GFATOOLS_PATH_CLAMP).length
  console.log(
    `${bubbles.length} bubbles in the tier` +
      (clamped > 0 ? ` (${clamped} at the gfatools clamp)` : ''),
  )

  const ranked = [...bubbles].sort((a, b) => b.segments - a.segments)
  const loci = []
  for (const b of ranked.slice(0, topN)) {
    const genes = await genesAt(spec.genome, spec.geneTrack, b)
    const label = labelFor(genes)
    loci.push({
      id: `${b.chrom}_${b.start}`,
      gene: label ?? `${b.chrom}:${b.start.toLocaleString()}`,
      fullName: label
        ? `${b.chrom}:${b.start.toLocaleString()}-${b.end.toLocaleString()}`
        : 'intergenic; the graph varies here but no gene is annotated',
      chrom: b.chrom,
      start: b.start,
      end: b.end,
      segments: b.segments,
      shortestAllele: b.shortest,
      longestAllele: b.longest,
      inversion: b.inversion > 0,
      drawable: b.end - b.start <= MAX_DRAWABLE_BP,
      genes,
    })
    process.stdout.write(
      `  ${b.chrom}:${b.start.toLocaleString()} ${String(b.segments).padStart(5)} segments  ${label ?? '(intergenic)'}\n`,
    )
  }

  const outDir = path.join(__dirname, `public/pangenome-${id}`)
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, 'loci.json')
  fs.writeFileSync(
    out,
    `${JSON.stringify({ dataset: id, source: spec.tier, generated: new Date().toISOString().slice(0, 10), loci }, null, 2)}\n`,
  )
  console.log(`\nWrote ${loci.length} derived loci to ${out}`)
}

void main()
