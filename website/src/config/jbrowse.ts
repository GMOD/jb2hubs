// Single source for which hosted JBrowse build every launch link on the site
// points at. Staging tracks `main` so in-development view features (new
// LaunchView options, bundled msaview/protein3d plugins) can be exercised before
// release; production pins the released `latest`. Builders that need extra query
// params compose on JBROWSE_BASE directly.
import { features } from './features.ts'

export const JBROWSE_BASE = features.staging
  ? 'https://jbrowse.org/code/jb2/main'
  : 'https://jbrowse.org/code/jb2/latest'

// Does the build JBROWSE_BASE points at have LinearMultiSampleVariantDisplay?
//
// This is a capability of the HOST, not a feature of the site, and it is one a
// launch cannot degrade gracefully over: a `displays[]` entry naming a display
// type the host does not have fails the track config's MST union, which takes
// down the whole spec session — the launch lands on "Select a view to launch"
// with an error, rather than on the view minus one display. Measured 2026-08-06
// against both hosted builds with the same probe: on `main` the display builds
// with `renderingMode`/`jexlFilters` intact; on `latest` every form of the
// declaration is rejected, including the bare `{ type, displayId }`, so it is
// the type that is missing rather than a slot.
//
// Keyed on the same flag as the base url because that is what decides which
// build is asked. DELETE this and inline the declaration once a released
// `latest` carries the display — re-run the probe rather than assuming, since
// the failure is silent from this side.
export const HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY = features.staging

// `config` is either site-relative (/ucsc/hg38/config.json) or an absolute URL
// (a hosted hub config, or the merge API).
export function jbrowseUrl(config: string) {
  return `${JBROWSE_BASE}/?config=${encodeURIComponent(config)}`
}

// Neither website serves the configs: a site-relative `?config=/ucsc/…` works
// because jbrowse-web resolves it against ITS origin, the jbrowse.org bucket.
// The website's own code reading one of those files gets no such favour — its
// origin is genomes.jbrowse.org — so anything fetched here needs the bucket
// spelled out. The bucket sends `access-control-allow-origin: *`.
const HOSTED_DATA_ORIGIN = 'https://jbrowse.org'

export function hostedUrl(sitePath: string) {
  return `${HOSTED_DATA_ORIGIN}${sitePath}`
}

// Staging launches a SIBLING config file (config.json -> config-staging.json),
// written by ucsc2jbrowse/stageConfigs.sh, carrying the plugins that are staging
// only — today the BLAT plugin. Regenerating config.json publishes to production
// and staging alike, so a sibling is what makes a config-level feature stageable
// at all.
//
// A sibling rather than a /ucsc-staging/ tree because a UCSC config names most of
// its data relatively and jbrowse-web resolves those against the config's own
// URL: only a file in the same directory reaches the data production serves.
export function stagingSibling(file: string, staging: boolean) {
  return staging ? file.replace(/\.json$/, '-staging.json') : file
}

export function ucscConfigPath(db: string) {
  return `/ucsc/${db}/${stagingSibling('config.json', features.staging)}`
}

// The merged all-species config, a sibling of the per-assembly ones.
export function ucscAllConfigPath() {
  return `/ucsc/${stagingSibling('all.json', features.staging)}`
}

// GenArk hub configs are sharded by the accession's digits, so the config path is
// derivable from the accession alone — no need to ship a URL per row:
// GCF_000298275.1 -> /hubs/genark/GCF/000/298/275/GCF_000298275.1/config.json
// Not staged: there are thousands of them, and nothing staged so far is
// GenArk-specific.
export function genarkConfigPath(accession: string) {
  const [prefix = '', rest = ''] = accession.split('_')
  const digits = rest.replace(/\.\d+$/, '')
  const [b1, b2, b3] = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 9),
  ]
  return `/hubs/genark/${prefix}/${b1}/${b2}/${b3}/${accession}/config.json`
}

// processedHubJson and the mouse-strain JSON bake launch URLs against whichever
// build the generator was written for, so retarget them rather than letting a
// staging page link into the production bundle (or vice versa).
export function retargetJbrowseUrl(url: string) {
  return url.replace(/^https:\/\/jbrowse\.org\/code\/jb2\/[^/]+/, JBROWSE_BASE)
}

// The gene-first launches (/orthologs, /conserved-gene-order) go to `main`
// rather than to whatever JBROWSE_BASE pins, because those are the only launches
// that open an NCBI RefSeq GFF3 panel and `latest` cannot draw one.
//
// `showOnlyGenes` and the label fallback chain that make that track readable
// (hubtools/src/ncbiGff.ts) are a config slot and a jexl expression the released
// v4.3.0 has no code for — the slot is dropped from the MST snapshot in silence.
// Measured 2026-08-28 at the BRCA1 window on hg38: 116 top-level records, 22 of
// them genes, and on `latest` the panel labels 33 of them with a bare UUID and
// 51 with `id-GeneID:…`. The reader came for the gene.
//
// The trade is deliberate and temporary: `main` is a moving build, which is the
// whole reason production pins a release, and this accepts that for two pages
// until v5.0.0 publishes. DELETE this and its callers then — `latest` updates
// itself, and JBROWSE_BASE is right for every launch on the site again.
const GENE_TRACK_HOST = 'https://jbrowse.org/code/jb2/main'

export function onGeneTrackHost(url: string) {
  return url.replace(
    /^https:\/\/jbrowse\.org\/code\/jb2\/[^/]+/,
    GENE_TRACK_HOST,
  )
}
