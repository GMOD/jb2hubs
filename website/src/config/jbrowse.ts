// Single source for which hosted JBrowse build every launch link on the site
// points at. The site targets `main`: the released v4.3.0 reads no session
// hash, has no workspace layout tree and no multi-sample variant display,
// and labels the NCBI GFF3 with UUIDs, and nothing here works around that any
// more. Point this at `latest` once v5.0.0 publishes.
import { hubPath } from 'hubtools/hubPath'

import { features } from './features.ts'

export const JBROWSE_BASE = 'https://jbrowse.org/code/jb2/main'

// `config` is either site-relative (/ucsc/hg38/config.json) or an absolute URL
// (a hosted hub config, or the merge API), and the rest are the launch's
// url-spec keys, in one order everywhere.
export function jbrowseUrl(
  config: string,
  {
    assembly,
    loc,
    tracks = [],
    highlight,
  }: {
    assembly?: string
    loc?: string
    tracks?: string[]
    highlight?: string
  } = {},
) {
  return [
    `${JBROWSE_BASE}/?config=${encodeURIComponent(config)}`,
    ...(assembly ? [`assembly=${encodeURIComponent(assembly)}`] : []),
    ...(loc ? [`loc=${encodeURIComponent(loc)}`] : []),
    ...(tracks.length > 0
      ? [`tracks=${tracks.map(t => encodeURIComponent(t)).join(',')}`]
      : []),
    ...(highlight ? [`highlight=${encodeURIComponent(highlight)}`] : []),
  ].join('&')
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
// written by ucsc2jbrowse/src/buildConfigs.ts, carrying any plugin that is staging
// only (none today) and the v5-only displays. Regenerating config.json publishes to production
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

// The sibling also keeps the tracks and displays v4.3.0 cannot open, which
// config.json leaves out (hubtools' withoutV5Only). A launch that needs one, such
// as the multi-way star, reads it on every site.
export function ucscV5ConfigPath(db: string) {
  return `/ucsc/${db}/config-staging.json`
}

// The merged all-species config, a sibling of the per-assembly ones.
export function ucscAllConfigPath() {
  return `/ucsc/${stagingSibling('all.json', features.staging)}`
}

// GenArk hub configs are sharded by the accession's digits, as hubtools lays
// out hubs/, so the config path is derivable from the accession alone:
// GCF_000298275.1 -> /hubs/genark/GCF/000/298/275/GCF_000298275.1/config.json
export const genarkConfigPath = (accession: string) =>
  `/hubs/genark/${hubPath(accession) ?? accession}/config.json`

// A genome the site hosts: a UCSC-native one launches the curated /ucsc/<db>
// config, whose assembly is the db, and the gene track its defaultSession
// opens (`geneTrack`, from the ortholog index); any other its GenArk hub's
// config, named by accession, and the hub's NCBI GFF.
export interface HostedGenomeRef {
  accession: string
  ucscDb?: string
  geneTrack?: string
}

export const genomeConfigPath = ({ accession, ucscDb }: HostedGenomeRef) =>
  ucscDb ? ucscConfigPath(ucscDb) : genarkConfigPath(accession)

export const genomeAssemblyName = ({ accession, ucscDb }: HostedGenomeRef) =>
  ucscDb ?? accession

// About 1 GCF hub in 300 has no ncbiGff and opens without a gene track.
export const genomeGeneTrack = ({
  accession,
  ucscDb,
  geneTrack,
}: HostedGenomeRef) => (ucscDb ? geneTrack : `${accession}-ncbiGff`)
