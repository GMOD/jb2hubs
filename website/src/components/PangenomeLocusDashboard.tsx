import useSWRImmutable from 'swr/immutable'

import PangeneMatrix from './PangeneMatrix.tsx'
import PangenomeBarChart from './PangenomeBarChart.tsx'
import PangenomeMsaSection from './PangenomeMsaSection.tsx'
import PangenomeVariationBadges from './PangenomeVariationBadges.tsx'
import {
  hprcSyntenyUrl,
  hprcVcfLgvUrl,
  syntenyMultiUrl,
} from './pangenomeLinks.ts'
import { locusRegion, syntenyGene } from './pangenomeLoci.ts'
import { fetchJson } from '../lib/fetchJson.ts'

import type { LocusSummary } from './pangenomeData.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

function typeBins(typeCounts: Record<string, number>) {
  return Object.entries(typeCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

export default function PangenomeLocusDashboard({
  locus,
}: {
  locus: PangenomeLocus
}) {
  const { data: summary, error } = useSWRImmutable<LocusSummary>(
    `/pangenome/${locus.id}.vcfsummary.json`,
    fetchJson,
  )
  const gene = syntenyGene(locus)

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
            GRCh38 {locusRegion(locus)}
            {summary && (
              <>
                {' · '}
                {summary.variantCount.toLocaleString()} pangenome variants ·{' '}
                {summary.sampleBurden.length} samples
              </>
            )}
          </p>
          <p className="pg-dash-story">{locus.story}</p>
        </div>
      </div>

      <div className="pg-launch-bar">
        <a
          className="pg-launch-btn"
          href={hprcVcfLgvUrl(locus)}
          target="_blank"
          rel="noreferrer"
        >
          Browse HPRC variants in JBrowse →
        </a>
        <a
          className="pg-launch-btn pg-launch-secondary"
          href={hprcSyntenyUrl(locus)}
          target="_blank"
          rel="noreferrer"
        >
          Compare GRCh38 ↔ CHM13 (synteny) →
        </a>
        <a
          className="pg-launch-btn pg-launch-secondary"
          href={syntenyMultiUrl(locus)}
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
            <h4 className="pg-chart-title">
              Non-reference alleles per sample (this region)
            </h4>
            <PangenomeBarChart
              bins={summary.sampleBurden.map(s => ({
                label: s.sample,
                count: s.count,
              }))}
            />
          </div>
        </>
      )}

      {locus.pangeneGenes?.length ? <PangeneMatrix locus={locus} /> : null}

      <PangenomeMsaSection locus={locus} />
    </div>
  )
}
