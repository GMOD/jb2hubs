// Single source for which hosted JBrowse build every launch link on the site
// points at. The site targets `main`: the released v4.3.0 reads no session
// hash, has no workspace layout tree and no LinearMultiSampleVariantDisplay,
// and labels the NCBI GFF3 with UUIDs, and nothing here works around that any
// more. Point this at `latest` once v5.0.0 publishes.
import { features } from './features.ts'

export const JBROWSE_BASE = 'https://jbrowse.org/code/jb2/main'

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
// written by ucsc2jbrowse/src/buildConfigs.ts, carrying the plugins that are staging
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
