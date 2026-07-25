// Single source for which hosted JBrowse build every launch link on the site
// points at. Staging tracks `main` so in-development view features (new
// LaunchView options, bundled msaview/protein3d plugins) can be exercised before
// release; production pins the released `latest`. Builders that need extra query
// params compose on JBROWSE_BASE directly.
import { features } from './features.ts'

export const JBROWSE_BASE = features.staging
  ? 'https://jbrowse.org/code/jb2/main'
  : 'https://jbrowse.org/code/jb2/latest'

// `config` is either site-relative (/ucsc/hg38/config.json) or an absolute URL
// (a hosted hub config, or the merge API).
export function jbrowseUrl(config: string) {
  return `${JBROWSE_BASE}/?config=${encodeURIComponent(config)}`
}

// GenArk hub configs are sharded by the accession's digits, so the config path is
// derivable from the accession alone — no need to ship a URL per row:
// GCF_000298275.1 -> /hubs/genark/GCF/000/298/275/GCF_000298275.1/config.json
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
