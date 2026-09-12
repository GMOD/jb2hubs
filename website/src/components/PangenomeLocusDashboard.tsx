import useSWRImmutable from 'swr/immutable'

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
  locusLaunchUrl,
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

// Everything the tier reported about a derived locus, which is everything known
// about it. It stands in for the four charts above rather than beside them: a
// derived catalogue has no callset to decompose, so there is no variant-type
// breakdown, no allele-frequency histogram and no per-sample burden to draw —
// those are all arithmetic over carriage.
function DerivedBubbleFacts({
  dataset,
  locus,
}: {
  dataset: PangenomeDataset
  locus: PangenomeLocus
}) {
  const derived = locus.derived
  // The catalogue is written in rank order, so the position in it IS the rank.
  const rank = dataset.loci.indexOf(locus) + 1
  return derived ? (
    <>
      <p className="pg-hint pg-provenance">
        Ranked #{rank} of {dataset.loci.length} in this graph&rsquo;s derived
        catalogue, which is its coarse tier sorted by how many segments each
        top-level bubble holds and named off the {dataset.reference.label}{' '}
        annotation. Nobody curated this list;{' '}
        <a href="https://github.com/GMOD/jb2hubs/blob/main/website/generatePangenomeLoci.ts">
          <code>generatePangenomeLoci.ts</code>
        </a>{' '}
        derived it from the graph.
      </p>
      <dl className="pg-facts">
        <div>
          <dt>Segments in the bubble</dt>
          <dd>{derived.segments.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Reference span</dt>
          <dd>{(locus.end - locus.start).toLocaleString()} bp</dd>
        </div>
        <div>
          <dt>Alternative paths</dt>
          <dd>
            {derived.shortestAllele.toLocaleString()}&ndash;
            {derived.longestAllele.toLocaleString()} bp
          </dd>
        </div>
        <div>
          <dt>Genes covered</dt>
          <dd>
            {derived.genes.length > 0 ? derived.genes.join(', ') : 'none'}
          </dd>
        </div>
      </dl>
      {dataset.noCallsetReason && (
        <p className="pg-hint pg-provenance">{dataset.noCallsetReason}</p>
      )}
    </>
  ) : null
}

export default function PangenomeLocusDashboard({
  dataset,
  locus,
}: {
  dataset: PangenomeDataset
  locus: PangenomeLocus
}) {
  // A derived locus has no precomputed anything: the derivation ranks a tier
  // file and computes nothing per locus, so there is no `<id>.vcfsummary.json`
  // to fetch and asking for one would render a load error over a locus that is
  // working exactly as intended. `derived` is per locus rather than per dataset
  // because a dataset could hold both kinds.
  const { data: summary, error } = useSWRImmutable<LocusSummary>(
    locus.derived ? null : `${dataset.dataPrefix}/${locus.id}.vcfsummary.json`,
    fetchJson,
  )
  const gene = syntenyGene(locus)
  const target = dataset.syntenyTarget
  const syntenyUrl = referenceSyntenyUrl(dataset, locus)
  // The callset beside the reference genes where the dataset has one, else the
  // graph's own bubbles/alleles/segments lanes — and undefined where neither is
  // reachable, which on production is every locus of the two non-human
  // datasets, since all three of their adapters live in the plugin.
  const variantsUrl = locusLaunchUrl(dataset, locus)
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
        {variantsUrl && (
          <a
            className="pg-launch-btn"
            href={variantsUrl}
            target="_blank"
            rel="noreferrer"
          >
            {dataset.graphVcf
              ? `Browse ${dataset.label} variants + structural variation in JBrowse →`
              : `Browse the ${dataset.label} bubbles and alleles in JBrowse →`}
          </a>
        )}
        {graphUrl && (
          <a
            className="pg-launch-btn"
            href={graphUrl}
            target="_blank"
            rel="noreferrer"
          >
            Draw {gene ?? locus.gene} as a pangenome graph →
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
            Draw {gene ?? locus.gene} as a graph in {ext.name} ↗
          </a>
        )}
        {!variantsUrl && !graphUrl && !externalUrl && (
          <p className="pg-hint pg-launch-note">
            No JBrowse launch for this locus on this build. Every lane this
            graph has — bubbles, the allele inventory, the segments — is read by
            an adapter that ships in the GraphGenomeView plugin rather than in
            JBrowse core, and that plugin boots on v5 only. The coordinates and
            the numbers below are the whole of what this page can show until
            then.
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
        {variantsUrl && (
          <OpenInDesktop
            className="pg-launch-btn pg-launch-secondary"
            webUrl={variantsUrl}
          />
        )}
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
        {geneHubUrl(dataset, locus) && gene && (
          <a
            className="pg-launch-btn pg-launch-secondary"
            href={geneHubUrl(dataset, locus)}
          >
            {gene} across species (gene hub) →
          </a>
        )}
      </div>

      {locus.derived ? (
        <DerivedBubbleFacts
          dataset={dataset}
          locus={locus}
        />
      ) : (
        <>
          {error ? (
            <p className="pg-error">
              Could not load the precomputed summary for this locus:{' '}
              {errorText(error)}
            </p>
          ) : null}
          {!summary && !error && <p className="pg-hint">Loading summary…</p>}
        </>
      )}

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

      {locus.derived ? null : (
        <PangenomeMsaSection
          dataPrefix={dataset.dataPrefix}
          referenceLabel={dataset.reference.label}
          locus={locus}
        />
      )}
    </div>
  )
}
