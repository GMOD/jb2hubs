// Write the haplotype half of `pangenome-config/hprc-grch38.json`: an assembly
// for every HPRC release 2 haplotype, a gene track for each one CAT annotates,
// and the `chrom.sizes` each assembly reads.
//
// Why assemblies at all: a lane draws under its PanSN name without one, but it
// reads its gene models from a track declared for its assembly alone, so a
// haplotype with no assembly reads "no annotation". There is no sequence to
// serve here — the lane draws alignments, not bases — so each assembly is a
// `ChromSizesAdapter`.
//
// The lengths come from the `.fai` HPRC publishes beside each release 2
// assembly, with the PanSN prefix stripped, since the graph and the CAT
// annotation both name contigs bare (`CM094060.1`). The graph's walks fall
// short of a contig's length by whatever telomere minigraph-cactus clipped.
//
// Which haplotypes: all of them, so any haplotype a view picks has an
// assembly, and every one but HG002's two has genes. Measured with 465
// assemblies, the config costs ~0.1 s at boot and nothing per launch beyond the
// lanes it opens, because jbrowse-web loads an assembly only when something
// reads it.
//
// The gene files are built and published by
// `pangenome-config/buildHprcGenes.sh` on the build box, from the tracks this
// writes; run it before upload.sh publishes the config.
//
// Not wired into the build: it needs the network. Its output is committed.
//   node generatePangenomeHaplotypes.ts
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { formatJson, myfetchtextWithRetry } from 'hubtools'

import {
  ASSEMBLY_INDEX,
  CAT_INDEX,
  httpsOf,
  indexByHaplotype,
} from './pangenomeHprcIndex.ts'
import { HPRC_GRAPH_BROWSER } from './src/components/pangenomeDataset.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG = path.join(__dirname, 'pangenome-config/hprc-grch38.json')
const SIDECARS = path.join(__dirname, 'pangenome-config/hprc-grch38')

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

// `#0` rows are the references the graph is built on, not haplotypes.
const haplotypes = [...assemblyIndex.keys()]
  .filter(h => !h.endsWith('#0'))
  .sort()
const bare = haplotypes.filter(h => !catIndex.has(h))

fs.mkdirSync(SIDECARS, { recursive: true })
const written: {
  haplotype: string
  assembly: string
  sample: string
  hap: string
}[] = []
for (const haplotype of haplotypes) {
  const fai = assemblyIndex.get(haplotype)?.assembly_fai
  if (!fai) {
    throw new Error(`${haplotype} has no assembly .fai in ${ASSEMBLY_INDEX}`)
  }
  const prefix = `${haplotype}#`
  const rows = (await myfetchtextWithRetry(httpsOf(fai)))
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
  written.push({ haplotype, assembly, sample, hap })
  console.log(`  ${assembly}: ${rows.length} contigs`)
}

const catTrackId = (assembly: string) => `${assembly}_cat_genes`
const generatedTracks = new Set(
  config.assemblies.slice(1).map(a => catTrackId(a.name)),
)
const otherTracks = config.tracks.filter(t => !generatedTracks.has(t.trackId))
const geneTrackIndex = otherTracks.findIndex(
  t => t.trackId === HPRC_GRAPH_BROWSER.geneTrackId,
)
if (geneTrackIndex === -1) {
  throw new Error(`${CONFIG} has no ${HPRC_GRAPH_BROWSER.geneTrackId} track`)
}
const geneTrackAt = geneTrackIndex + 1

laneTrack!.adapter.assemblyNameToPanSN = {
  [anchor]: laneMap[anchor],
  ...Object.fromEntries(written.map(a => [a.assembly, a.haplotype])),
}

const out = {
  ...config,
  assemblies: [
    config.assemblies[0],
    ...written.map(({ haplotype, assembly, sample, hap }) => ({
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
    ...written
      .filter(a => catIndex.has(a.haplotype))
      .map(({ assembly, sample, hap }) => ({
        type: 'FeatureTrack',
        trackId: catTrackId(assembly),
        name: `CAT genes (${sample} haplotype ${hap}, HPRC release 2)`,
        assemblyNames: [assembly],
        adapter: {
          type: 'BedTabixAdapter',
          uri: `genes/${assembly}.genes.bed.gz`,
          csi: true,
        },
      })),
    ...otherTracks.slice(geneTrackAt),
  ],
}
fs.writeFileSync(CONFIG, formatJson(out))

console.log(
  `Wrote ${written.length} haplotype assemblies to ${CONFIG}` +
    (bare.length ? `; no CAT annotation for ${bare.join(', ')}` : ''),
)
