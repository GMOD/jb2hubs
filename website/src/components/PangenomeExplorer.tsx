import { useUrlState } from '../hooks/useUrlState.ts'
import PangenomeLocusDashboard from './PangenomeLocusDashboard.tsx'
import PangenomeVariationBadges from './PangenomeVariationBadges.tsx'
import { DEFAULT_DATASET_ID, PANGENOME_DATASETS } from './pangenomeDataset.ts'
import {
  VARIATION_CLASSES,
  VARIATION_LABELS,
  preferredLocus,
} from './pangenomeLoci.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

// The generated `<dataPrefix>/manifest.json`, imported at build by the page and
// handed down rather than fetched again from the browser.
//
// Only a dataset whose per-locus callset summaries were generated has one,
// which is HPRC alone: a derived catalogue is a ranking of a tier file and
// nothing per locus was computed, so there is no variant count to put on a
// card. The grid falls back to the segment count the ranking is over, which is
// the better number for those datasets anyway — it is what "this is where the
// graph varies" means.
export interface PangenomeManifest {
  samples: string[]
  loci: { id: string; gene: string; variantCount: number }[]
}

// What a card counts. `variants` needs a manifest; `segments` needs only the
// catalogue.
function cardCounts(dataset: PangenomeDataset, manifest?: PangenomeManifest) {
  return manifest
    ? {
        unit: 'variants',
        of: new Map(manifest.loci.map(l => [l.id, l.variantCount])),
      }
    : {
        unit: 'segments',
        of: new Map(
          dataset.loci.flatMap(l =>
            l.derived ? [[l.id, l.derived.segments] as const] : [],
          ),
        ),
      }
}

// The class filters are offered only where the catalogue actually carries
// classes, which is the curated one. A derived entry's only claimable class is
// the tier's inversion flag (see `derivedLoci`), so on mouse exactly 1 of 20
// loci had one and four of the five chips filtered the grid to nothing — an
// empty grid, silently, under a dashboard still showing a locus the filter
// excluded. A control that cannot work on the data in front of it should not be
// drawn.
function classesPresent(loci: PangenomeLocus[]) {
  const present = new Set(loci.flatMap(l => l.variation))
  return VARIATION_CLASSES.filter(c => present.has(c))
}

// A catalogue that came out of the tier ranking rather than out of a curated
// list. Read off the loci rather than off "no manifest was passed": those
// coincide today, and only one of them is the actual question — a dataset could
// have summaries generated for derived loci, and HPRC rendered without its
// manifest is still curated.
function isDerived(dataset: PangenomeDataset) {
  return dataset.loci.every(l => l.derived !== undefined)
}

// Only a dataset with a locus catalog can be explored.
const EXPLORABLE = PANGENOME_DATASETS.filter(d => d.loci.length > 0)

function LocusGrid({
  dataset,
  manifest,
}: {
  dataset: PangenomeDataset
  manifest?: PangenomeManifest
}) {
  const loci = dataset.loci
  const classes = classesPresent(loci)
  // ?locus=<id> and ?filter=<class> deep-link via useUrlState so a shared URL
  // restores the grid view (back/forward included); each param is dropped when
  // it equals its default. An unknown value falls back to the default rather
  // than breaking the view.
  //
  // The default locus is `preferredLocus`, not `loci[0]`: the top-ranked entry
  // in both derived catalogues is a multi-megabase cluster, so landing on it
  // opened the callset or the allele inventory over 2.24 Mb.
  const [selectedId, setSelectedId] = useUrlState(
    'locus',
    preferredLocus(loci)?.id ?? '',
  )
  const [rawFilter, setRawFilter] = useUrlState('filter', 'all')
  const filter = classes.find(c => c === rawFilter) ?? 'all'

  const counts = cardCounts(dataset, manifest)
  const visible =
    filter === 'all' ? loci : loci.filter(l => l.variation.includes(filter))
  // An unknown ?locus= falls back to the landing locus, and the grid highlights
  // what the dashboard actually shows rather than the id in the url.
  const selected =
    visible.find(l => l.id === selectedId) ?? visible[0] ?? loci[0]

  return (
    <div>
      <p>
        {dataset.reference.label} loci where structure varies between the
        assemblies in the {dataset.label} graph ({dataset.panelDescription}),
        with JBrowse launches. The graph files and assemblies are on{' '}
        <a href={`/pangenomes/${dataset.id}`}>its pangenome page</a>, and{' '}
        <a href={dataset.portal.tutorialUrl}>its tutorial</a> walks what this
        graph can and cannot show.
      </p>
      {isDerived(dataset) && (
        <p className="pg-hint">
          This catalogue is derived rather than curated: the graph&rsquo;s
          coarse tier is ranked by how many segments each top-level bubble
          holds, and each entry named off the {dataset.reference.label}{' '}
          annotation. Nobody picked these loci, so the cards count segments
          rather than variant sites &mdash; that count is what the ranking is.
        </p>
      )}

      {classes.length > 1 && (
        <div className="pg-filters">
          {['all' as const, ...classes].map(f => (
            <button
              key={f}
              className={`pg-filter${filter === f ? ' pg-filter-active' : ''}`}
              aria-pressed={filter === f}
              onClick={() => {
                setRawFilter(f)
              }}
            >
              {f === 'all' ? 'All' : VARIATION_LABELS[f]}
            </button>
          ))}
        </div>
      )}

      <div className="pg-grid">
        {visible.map(l => {
          const n = counts.of.get(l.id)
          return (
            <button
              key={l.id}
              className={`pg-card${l.id === selected?.id ? ' pg-card-active' : ''}`}
              aria-pressed={l.id === selected?.id}
              onClick={() => {
                setSelectedId(l.id)
              }}
            >
              <span className="pg-card-gene">{l.gene}</span>
              <span className="pg-card-fullname">{l.fullName}</span>
              <PangenomeVariationBadges variation={l.variation} />
              {n === undefined ? null : (
                <span className="pg-card-count">
                  {n.toLocaleString()} {counts.unit}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selected && (
        <PangenomeLocusDashboard
          dataset={dataset}
          locus={selected}
        />
      )}
    </div>
  )
}

// `manifests` holds one generated manifest per explorable dataset id, imported
// at build by the page. ?dataset=<id> picks the dataset; an unknown id falls
// back to the default.
export default function PangenomeExplorer({
  manifests,
}: {
  manifests: Record<string, PangenomeManifest>
}) {
  const [datasetId, setDatasetId] = useUrlState('dataset', DEFAULT_DATASET_ID)
  const dataset = EXPLORABLE.find(d => d.id === datasetId) ?? EXPLORABLE[0]

  return dataset === undefined ? (
    <p className="pg-error">
      No pangenome dataset has a locus catalog to explore yet.
    </p>
  ) : (
    <div>
      {EXPLORABLE.length > 1 ? (
        <p className="pg-filters">
          <span>Dataset:</span>
          {EXPLORABLE.map(d => (
            <button
              key={d.id}
              className={`pg-filter${d.id === dataset.id ? ' pg-filter-active' : ''}`}
              aria-pressed={d.id === dataset.id}
              onClick={() => {
                setDatasetId(d.id)
              }}
            >
              {d.label}
            </button>
          ))}
        </p>
      ) : null}
      <LocusGrid
        key={dataset.id}
        dataset={dataset}
        manifest={manifests[dataset.id]}
      />
    </div>
  )
}
