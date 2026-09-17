// Write the haplotype half of `pangenome-config/hprc-grch38.json`: one assembly
// and one CAT gene track per haplotype a lane panel names, and the `chrom.sizes`
// each assembly reads.
//
// Why assemblies at all: a lane draws under its PanSN name without one, but it
// reads its gene models from a track declared for its assembly alone, so a
// haplotype with no assembly reads "no annotation". There is no sequence to
// serve here — the lane draws alignments, not bases — so each assembly is a
// `ChromSizesAdapter`.
//
// The lengths come from the `.fai` HPRC publishes beside each release 2
// assembly, with the PanSN prefix stripped, since the graph and the CAT
// annotation both name contigs bare (`CM094060.1`). This used to derive them
// from the `.gbz.db` as the furthest extent of each contig's path fragments,
// which is short of the real length by whatever telomere minigraph-cactus
// clipped, and took ~18 GB of range requests to find out.
//
// Which haplotypes: every one `public/pangenome-hprc/panels.json` names, plus
// any the lane track already maps, that HPRC's CAT index annotates. HG002#1 is
// the one panel haplotype it does not, and its lane stays bare.
//
// The gene files are built and published by
// `pangenome-config/buildHprcGenes.sh` on the build box, from the tracks this
// writes. After the panels move, rerun in this order: this, buildHprcGenes.sh,
// generatePangenomePanels.ts (which prefers annotated haplotypes, so it only
// swaps a lane for one this already annotated), then upload.sh.
//
// Not wired into the build: it needs the network. Its output is committed.
//   node generatePangenomeHaplotypes.ts
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { formatJson } from 'hubtools'

import panelsFile from './public/pangenome-hprc/panels.json' with { type: 'json' }
import { HPRC_GRAPH_BROWSER } from './src/components/pangenomeDataset.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG = path.join(__dirname, 'pangenome-config/hprc-grch38.json')
const SIDECARS = path.join(__dirname, 'pangenome-config/hprc-grch38')

const TABLES =
  'https://raw.githubusercontent.com/human-pangenomics/hprc_intermediate_assembly/main/data_tables'
const ASSEMBLY_INDEX = `${TABLES}/assemblies_release2_v1.0.index.csv`
const CAT_INDEX = `${TABLES}/annotation/cat/cat_genes_hprc_r2_v1.3.index.csv`

interface Track {
  trackId: string
  assemblyNames: string[]
  adapter: {
    assemblyNameToPanSN?: Record<string, string>
    [key: string]: unknown
  }
}

interface Config {
  assemblies: { name: string }[]
  tracks: Track[]
}

async function fetchText(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`)
  }
  return res.text()
}

const httpsOf = (s3: string) =>
  s3.replace(/^s3:\/\/([^/]+)\//, 'https://s3-us-west-2.amazonaws.com/$1/')

// `sample_id,haplotype,...` rows keyed by PanSN prefix, `HG00097#1`.
async function indexByHaplotype(url: string) {
  const [header, ...rows] = (await fetchText(url)).trim().split('\n')
  const columns = header!.split(',')
  return new Map(
    rows.map(row => {
      const record = Object.fromEntries(
        row.split(',').map((value, i) => [columns[i]!, value]),
      )
      return [`${record.sample_id}#${record.haplotype}`, record]
    }),
  )
}

const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8')) as Config
const laneTrack = config.tracks.find(
  t => t.trackId === HPRC_GRAPH_BROWSER.haplotypeLanesTrackId,
)
const laneMap = laneTrack?.adapter.assemblyNameToPanSN
const anchor = config.assemblies[0]!.name
if (!laneMap?.[anchor]) {
  throw new Error(
    `hprc-grch38.json has no lane track mapping ${anchor}, which must stay the first assembly`,
  )
}

const assemblyIndex = await indexByHaplotype(ASSEMBLY_INDEX)
const catIndex = await indexByHaplotype(CAT_INDEX)

const wanted = new Set([
  ...Object.values(panelsFile.panels).flatMap(p =>
    p.lanes.map(l => l.haplotype),
  ),
  ...Object.entries(laneMap)
    .filter(([assembly]) => assembly !== anchor)
    .map(([, haplotype]) => haplotype),
])
const haplotypes = [...wanted].filter(h => catIndex.has(h)).sort()
const bare = [...wanted].filter(h => !catIndex.has(h)).sort()

fs.mkdirSync(SIDECARS, { recursive: true })
const annotated: {
  haplotype: string
  assembly: string
  sample: string
  hap: string
}[] = []
for (const haplotype of haplotypes) {
  const fai = assemblyIndex.get(haplotype)?.assembly_fai
  if (!fai) {
    throw new Error(
      `${haplotype} has a CAT annotation but no assembly .fai in ${ASSEMBLY_INDEX}`,
    )
  }
  const prefix = `${haplotype}#`
  const rows = (await fetchText(httpsOf(fai)))
    .trim()
    .split('\n')
    .map(line => {
      const [contig, length] = line.split('\t')
      if (!contig?.startsWith(prefix)) {
        throw new Error(`${fai} names ${contig}, not a ${prefix} contig`)
      }
      return `${contig.slice(prefix.length)}\t${length}`
    })
  const [sample, hap] = haplotype.split('#') as [string, string]
  const assembly = `${sample}.${hap}`
  fs.writeFileSync(
    path.join(SIDECARS, `${assembly}.chrom.sizes`),
    `${rows.join('\n')}\n`,
  )
  annotated.push({ haplotype, assembly, sample, hap })
  console.log(`  ${assembly}: ${rows.length} contigs`)
}

const catTrackId = (assembly: string) => `${assembly}_cat_genes`
const generatedTracks = new Set(
  config.assemblies.slice(1).map(a => catTrackId(a.name)),
)
const otherTracks = config.tracks.filter(t => !generatedTracks.has(t.trackId))
const geneTrackAt =
  otherTracks.findIndex(t => t.trackId === HPRC_GRAPH_BROWSER.geneTrackId) + 1

laneTrack!.adapter.assemblyNameToPanSN = {
  [anchor]: laneMap[anchor],
  ...Object.fromEntries(annotated.map(a => [a.assembly, a.haplotype])),
}

const out = {
  ...config,
  assemblies: [
    config.assemblies[0],
    ...annotated.map(({ haplotype, assembly, sample, hap }) => ({
      name: assembly,
      aliases: [haplotype],
      displayName: `${sample} haplotype ${hap} (HPRC release 2)`,
      sequence: {
        type: 'ReferenceSequenceTrack',
        trackId: `${assembly}-ReferenceSequenceTrack`,
        adapter: {
          type: 'ChromSizesAdapter',
          chromSizesLocation: { uri: `${assembly}.chrom.sizes` },
        },
      },
    })),
  ],
  tracks: [
    ...otherTracks.slice(0, geneTrackAt),
    ...annotated.map(({ assembly, sample, hap }) => ({
      type: 'FeatureTrack',
      trackId: catTrackId(assembly),
      name: `CAT genes (${sample} haplotype ${hap}, HPRC release 2)`,
      assemblyNames: [assembly],
      adapter: {
        type: 'Gff3TabixAdapter',
        uri: `genes/${assembly}.genes.gff3.gz`,
      },
    })),
    ...otherTracks.slice(geneTrackAt),
  ],
}
fs.writeFileSync(CONFIG, formatJson(out))

console.log(
  `Wrote ${annotated.length} haplotype assemblies to ${CONFIG}` +
    (bare.length ? `; no CAT annotation for ${bare.join(', ')}` : ''),
)
