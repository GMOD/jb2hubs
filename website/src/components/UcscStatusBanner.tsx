import useSWR from 'swr'

import {
  CACHE_TTL_MS,
  isDegraded,
  probeUcscLiveness,
  type UcscLiveness,
} from '../lib/ucscLiveness.ts'
import styles from './UcscStatusBanner.module.css'

// What a reader actually needs is not "UCSC is down" but "which of these launch
// buttons will do nothing, and will it tell me".
//
// The two arms fail differently, and that difference is the whole reason to say
// anything. A UCSC assembly's chrom.sizes, chromAlias and cytoBand are mirrored
// beside its config on our own storage, so loadPre() resolves and the assembly
// opens — the reference sequence and any track served from UCSC are what hang. A
// GenArk hub's chromSizes and refNameAliases still come straight from
// hgdownload, and both sit in that same Promise.all, so the assembly itself never
// opens. See CLAUDE.md, "Assembly sidecars are mirrored on UCSC only".
function consequences(verdict: UcscLiveness) {
  const verb = verdict === 'stalled' ? 'will' : 'may'
  return [
    `UCSC assemblies (hg38, mm39, hs1, …) still open, because their chromosome sizes and aliases come from our storage. The reference sequence and any track served from UCSC ${verb} hang.`,
    `GenArk assemblies (GCA_/GCF_ accessions) ${verb} not open at all: their chromosome sizes come directly from UCSC.`,
  ]
}

/**
 * A warning shown on launch pages when UCSC's download server is not answering.
 *
 * Renders nothing when healthy and nothing when the probe was inconclusive, so
 * it is safe to drop in unguarded. Mount it `client:idle`: this is never the
 * reason to delay a page.
 */
export default function UcscStatusBanner() {
  const { data } = useSWR('ucsc-liveness', () => probeUcscLiveness(), {
    refreshInterval: CACHE_TTL_MS,
    dedupingInterval: CACHE_TTL_MS,
    // The probe's own catch turns every failure into a verdict, so there is
    // nothing for SWR to retry — and a retry storm against a stalled host is the
    // last thing this should cause.
    shouldRetryOnError: false,
  })

  if (!data || !isDegraded(data.verdict)) {
    return null
  }

  const seconds = (data.elapsedMs / 1000).toFixed(1)
  return (
    <aside
      className={styles.banner}
      role="status"
    >
      <p className={styles.headline}>
        {data.verdict === 'stalled'
          ? "UCSC's download server is not responding"
          : `UCSC's download server is responding slowly (${seconds}s)`}
      </p>
      <p>
        This site is fine, but most track data is served from{' '}
        <code>hgdownload.soe.ucsc.edu</code>.{' '}
        {data.verdict === 'stalled'
          ? 'It is accepting connections without answering them, so data requests hang instead of failing — a track will sit on a loading spinner rather than show an error.'
          : 'Tracks may take a very long time to load, or appear to hang.'}
      </p>
      <ul className={styles.list}>
        {consequences(data.verdict).map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {/* Earned, not asserted: the verdict comes from comparing hgdownload
          against a control request to this site, so a slow connection of the
          reader's own yields no banner at all. */}
      <p className={styles.footnote}>
        Measured from your browser against this site as a baseline, so this is
        not your connection. Reloading will not help; it clears when UCSC
        recovers.
      </p>
    </aside>
  )
}
