import useSWRImmutable from 'swr/immutable'

import OpenInDesktop from './OpenInDesktop.tsx'
import PangeneMatrix from './PangeneMatrix.tsx'
import PangenomeBarChart from './PangenomeBarChart.tsx'
import PangenomeMsaSection from './PangenomeMsaSection.tsx'
import PangenomeVariationBadges from './PangenomeVariationBadges.tsx'
import {
  crossSpeciesGeneOrderUrl,
  graphLocusUrl,
  graphVcfLgvUrl,
  referenceSyntenyUrl,
} from './pangenomeLinks.ts'
import { locusRegion, syntenyGene } from './pangenomeLoci.ts'
import { fetchJson } from '../lib/fetchJson.ts'

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
  const syntenyUrl = referenceSyntenyUrl(dataset, locus)
  const variantsUrl = graphVcfLgvUrl(dataset, locus)
  const graphUrl = graphLocusUrl(dataset, locus)

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
                {summary.variantCount.toLocaleString()} pangenome variants ·{' '}
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
        <OpenInDesktop
          className="pg-launch-btn pg-launch-secondary"
          webUrl={variantsUrl}
        />
        {syntenyUrl && dataset.syntenyTarget && (
          <a
            className="pg-launch-btn pg-launch-secondary"
            href={syntenyUrl}
            target="_blank"
            rel="noreferrer"
          >
            Compare {dataset.reference.label} ↔ {dataset.syntenyTarget.label}{' '}
            (synteny) →
          </a>
        )}
        <a
          className="pg-launch-btn pg-launch-secondary"
          href={crossSpeciesGeneOrderUrl(dataset, locus)}
        >
          {gene} gene-order across species →
        </a>
      </div>

      {error && (
        <p className="pg-error">
          Could not load precomputed summary for this locus.
        </p>
      )}
      {!summary && !error && <p className="pg-hint">Loading summary…</p>}

      {summary && (
        <>
          <p className="pg-hint pg-provenance">
            From the {summary.source} VCF ({summary.sampleBurden.length}{' '}
            samples), a reference-projected decomposition of the graph onto{' '}
            {summary.ref}; classes per <code>vcfwave</code>.
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
