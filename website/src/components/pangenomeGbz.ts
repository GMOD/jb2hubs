// The GBZ route: HPRC's graph queried at request time for who carries what.
//
// The other two routes here answer over the whole panel at once — the bubbles
// say a locus varies, the callset says at what frequency. Neither can put a
// named haplotype's own coordinates on an allele. This one can: a query returns
// one record per haplotype crossing the window, with a CIGAR against the
// reference, so the CFHR3-CFHR1 deletion comes back as HG01123#1's 84,684 bp D
// in that haplotype's own contig.
//
// It is read by `@gmod/gbz-base`, which is a pure-TypeScript SQLite page reader
// over HTTP range requests — no server, no download. Measured 2026-09-10 from
// node against the two published files: 0.32s to open, 0.34s to answer all 464
// haplotypes over a 105 kb window. Numbers and method in
// `agent-docs/PANGENOME_PORTAL.md`.
//
// NOT WIRED INTO A CONFIG YET. The identical track block in
// `demos/hprc/config.json` (they differ only in `name`) builds its display and
// its lane headers on a hosted `main`; ours sits on "Loading..." Swapping our
// hg38 assembly block for the demo's does not change that, so the difference is
// elsewhere.
//
// Do not trust the phrase "the demo works" without re-measuring it: the run
// that established it counted haplotype names in the page text, and those are
// lane LABELS that render from the config with or without data. That same
// launch, instrumented, made zero requests to the database host. Count requests
// to `s3-us-west-2.amazonaws.com` next time. Full bisect and both corrections
// in `agent-docs/PANGENOME_PORTAL.md`.
//
// STAGING ONLY once it is wired, for two independent reasons, both checked
// rather than assumed:
// `GbzBaseSyntenyAdapter` ships in the graphgenomeviewer plugin rather than in
// core, and `MultiWaySyntenyDisplay` landed on jbrowse-components `main` on
// 2026-09-09 and is absent from v4.3.0. So this reaches the site through
// `features.pangenomeGraph` like the graph pane it sits beside.

export interface PangenomeGbzHaplotype {
  // JBrowse assembly name, which is also the lane label.
  assembly: string
  // PanSN sample and haplotype, which is how the database names the path.
  sample: string
  haplotype: number
}

// The eight the HPRC tutorial's own figures use, so a reader coming from the
// docs sees the same panel. The adapter is NOT the reason it is eight — it
// answers all 464 in a third of a second. Each lane costs an assembly block in
// the config and a `chrom.sizes` beside it, and that is what is being kept
// small; widening the set is a re-run of `generatePangenomeHaplotypes.ts` and an
// upload, with no change to the data.
export const HPRC_GBZ_HAPLOTYPES: PangenomeGbzHaplotype[] = [
  { assembly: 'HG00097.1', sample: 'HG00097', haplotype: 1 },
  { assembly: 'HG00099.1', sample: 'HG00099', haplotype: 1 },
  { assembly: 'HG00128.1', sample: 'HG00128', haplotype: 1 },
  { assembly: 'HG00133.1', sample: 'HG00133', haplotype: 1 },
  { assembly: 'HG01109.1', sample: 'HG01109', haplotype: 1 },
  { assembly: 'HG01123.1', sample: 'HG01123', haplotype: 1 },
  { assembly: 'HG01960.1', sample: 'HG01960', haplotype: 1 },
  { assembly: 'HG02055.1', sample: 'HG02055', haplotype: 1 },
]

export const HPRC_GBZ = {
  trackId: 'hprc_v2_1_gbz_lanes',
  name: 'HPRC haplotypes vs GRCh38, read from the graph (gbz-base)',
  // Upstream's own database. We publish no copy — it is 10 GB, and range
  // requests mean nothing has to.
  dbUrl:
    'https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/release2/minigraph-cactus/v2.1/hprc-v2.1-mc-grch38/hprc-v2.1-mc-grch38.gbz.db',
  // The companion index upstream's database lacks, built here. It is what makes
  // a named subset cheaper than the whole panel; without it every query walks
  // all 464.
  haplotypeIndexUrl:
    'https://jbrowse.org/demos/hprc/hprc-v2.1-mc-grch38.haplotype-index.anchored.db',
  // The reference path in the database, as PanSN. The lane's own reference row.
  referencePanSN: 'GRCh38#0',
} as const

// PanSN names for the adapter, which addresses paths by `<sample>#<haplotype>`
// while JBrowse addresses assemblies by name. Includes the reference, since it
// is one of the lane's assemblies.
export function gbzPanSN(referenceAssembly: string) {
  return {
    [referenceAssembly]: HPRC_GBZ.referencePanSN,
    ...Object.fromEntries(
      HPRC_GBZ_HAPLOTYPES.map(h => [h.assembly, `${h.sample}#${h.haplotype}`]),
    ),
  }
}
