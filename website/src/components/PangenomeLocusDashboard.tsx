import useSWRImmutable from 'swr/immutable'

import { HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY } from '../config/jbrowse.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { errorText } from './ErrorMessage.tsx'
import OpenInDesktop from './OpenInDesktop.tsx'
import PangeneMatrix from './PangeneMatrix.tsx'
import PangenomeBarChart from './PangenomeBarChart.tsx'
import PangenomeMsaSection from './PangenomeMsaSection.tsx'
import PangenomeVariationBadges from './PangenomeVariationBadges.tsx'
import {
  externalGraphUrl,
  geneHubUrl,
  graphLocusUrl,
  graphVcfLgvUrl,
  referenceSyntenyUrl,
} from './pangenomeLinks.ts'
import { detailWindow, locusRegion, syntenyGene } from './pangenomeLoci.ts'

import type { LocusSummary } from './pangenomeData.ts'
import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

function typeBins(typeCounts: Record<string, number>) {
  return Object.entries(typeCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

// sampleBurden[i] = number of variant sites in this locus where sample i carries
// any non-reference allele (counted once per site, hom or het) — i.e. per-sample
// divergence from the reference, not an allele count or a functional load. It's
// pre-sorted descending by the generator, so this slice is the most-divergent N.
const TOP_DIVERGENT = 12

// Where there is no hosted graph (production, until core v5), the external
// browser stands in for the locus launch: same reference coordinates, its own
// graph build.
function externalLocusUrl(dataset: PangenomeDataset, locus: PangenomeLocus) {
  const window = detailWindow(locus)
  return window && !dataset.graphBrowser
    ? externalGraphUrl(dataset, { ...window, chrom: locus.chrom })
    : undefined
}

export default function PangenomeLocusDashboard({
  dataset,
  locus,
}: {
  dataset: PangenomeDataset
  locus: PangenomeLocus
}) {
  const { data: summary, error } = useSWRImmutable<LocusSummary>(
    `${dataset.dataPrefix}/${locus.id}.vcfsummary.json`,
    fetchJson,
  )
  const gene = syntenyGene(locus)
  const target = dataset.syntenyTarget
  const syntenyUrl = referenceSyntenyUrl(dataset, locus)
  const variantsUrl = graphVcfLgvUrl(dataset, locus)
  const graphUrl = graphLocusUrl(dataset, locus)
  const externalUrl = externalLocusUrl(dataset, locus)
  const ext = dataset.externalGraphBrowser

  return (
    <div className="pg-dashboard">
      <div className="pg-dash-header">
        <div>
          <h2 className="pg-dash-title">
            {locus.gene}{' '}
            <span className="pg-dash-fullname">{locus.fullName}</span>
          </h2>
          <PangenomeVariationBadges variation={locus.variation} />
          <p className="pg-dash-loc">
            {dataset.reference.label} {locusRegion(locus)}
            {summary && (
              <>
                {' · '}
                {summary.variantCount.toLocaleString()} pangenome variant sites
                · {summary.alleleCount.toLocaleString()} alleles ·{' '}
                {summary.sampleBurden.length} samples
              </>
            )}
          </p>
          {locus.significance && (
            <p className="pg-dash-significance">{locus.significance}</p>
          )}
        </div>
      </div>

      <div className="pg-launch-bar">
        <a
          className="pg-launch-btn"
          href={variantsUrl}
          target="_blank"
          rel="noreferrer"
        >
          Browse {dataset.label} variants + structural variation in JBrowse →
        </a>
        {graphUrl && (
          <a
            className="pg-launch-btn"
            href={graphUrl}
            target="_blank"
            rel="noreferrer"
          >
            Draw {gene} as a pangenome graph →
          </a>
        )}
        {externalUrl && ext && (
          <a
            className="pg-launch-btn"
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            title={`${ext.name} draws the ${ext.graphLabel} graph at this window`}
          >
            Draw {gene} as a graph in {ext.name} ↗
          </a>
        )}
        {!HOST_HAS_MULTISAMPLE_VARIANT_DISPLAY && (
          <p className="pg-hint pg-launch-note">
            On the current JBrowse release the callset opens as a single row;
            the per-haplotype matrix display ships in the next release.
          </p>
        )}
        {dataset.graphBrowser && locus.graphCollapsed && (
          <p className="pg-hint pg-launch-note">
            No graph launch: minigraph collapses this locus&rsquo;s
            near-identical paralogs onto a single path, so the graph holds no
            alternative route to draw here. The variant and copy-number views
            below are unaffected.
          </p>
        )}
        <OpenInDesktop
          className="pg-launch-btn pg-launch-secondary"
          webUrl={variantsUrl}
        />
        {target && (
          <a
            className="pg-launch-btn pg-launch-secondary"
            href={syntenyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Compare {dataset.reference.label} ↔ {target.label} (synteny) →
          </a>
        )}
        <a
          className="pg-launch-btn pg-launch-secondary"
          href={geneHubUrl(dataset, locus)}
        >
          {gene} across species (gene hub) →
        </a>
      </div>

      {error ? (
        <p className="pg-error">
          Could not load the precomputed summary for this locus:{' '}
          {errorText(error)}
        </p>
      ) : null}
      {!summary && !error && <p className="pg-hint">Loading summary…</p>}

      {summary && (
        <>
          <p className="pg-hint pg-provenance">
            From the {summary.source} VCF ({summary.sampleBurden.length}{' '}
            samples), a reference-projected decomposition of the graph onto{' '}
            {summary.ref}; classes per <code>vcfwave</code>. One bar per ALT
            allele rather than per site, so a multi-allelic site contributes
            each of its alleles at its own size and frequency.
          </p>
          <div className="pg-charts">
            <PangenomeBarChart
              title="Variant types"
              bins={typeBins(summary.typeCounts)}
            />
            <PangenomeBarChart
              title="Allele frequency (across HPRC assembly panel)"
              bins={summary.afHistogram}
            />
            <PangenomeBarChart
              title="Variant size"
              bins={summary.sizeHistogram}
            />
          </div>

          <div className="pg-burden">
            <PangenomeBarChart
              title={`Variant sites differing from ${summary.ref} — most-divergent ${Math.min(TOP_DIVERGENT, summary.sampleBurden.length)} of ${summary.sampleBurden.length} samples`}
              bins={summary.sampleBurden
                .slice(0, TOP_DIVERGENT)
                .map(s => ({ label: s.sample, count: s.count }))}
            />
            <p className="pg-hint pg-pangene-caption">
              Per sample, the count of variant sites in this locus where the
              assembly differs from {summary.ref} (a site counts once whether
              heterozygous or homozygous). Dominated by common SNVs, so this
              tracks overall sequence divergence from the reference — not a
              functional or disease burden.
            </p>
          </div>
        </>
      )}

      {locus.pangeneGenes?.length ? (
        <PangeneMatrix
          dataPrefix={dataset.dataPrefix}
          locus={locus}
        />
      ) : null}

      <PangenomeMsaSection
        dataPrefix={dataset.dataPrefix}
        referenceLabel={dataset.reference.label}
        locus={locus}
      />
    </div>
  )
}
