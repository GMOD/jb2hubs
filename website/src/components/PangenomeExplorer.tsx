import { useUrlState } from '../hooks/useUrlState.ts'
import PangenomeLocusDashboard from './PangenomeLocusDashboard.tsx'
import PangenomeVariationBadges from './PangenomeVariationBadges.tsx'
import { DEFAULT_DATASET_ID, PANGENOME_DATASETS } from './pangenomeDataset.ts'
import { VARIATION_LABELS } from './pangenomeLoci.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeLocus, VariationClass } from './pangenomeLoci.ts'

type Filter = VariationClass | 'all'
type Sort = 'catalog' | 'count'

const FILTERS: Filter[] = [
  'all',
  'cnv',
  'pav',
  'hyperdiversity',
  'vntr',
  'inversion',
]

const SORTS: { value: Sort; label: string }[] = [
  { value: 'catalog', label: 'Catalog order' },
  { value: 'count', label: 'Most variants' },
]

// The generated `<dataPrefix>/manifest.json`, imported at build by the page
// and handed down rather than fetched again from the browser.
//
// Only a dataset whose per-locus summaries were generated has one, which today
// is HPRC alone: a derived catalogue is a ranking of a tier file and nothing
// per locus was computed, so there is no variant count to put on a card. The
// grid falls back to the segment count the ranking is over, which is the
// better number for those datasets anyway — it is what "this is where the
// graph varies" means.
export interface PangenomeManifest {
  samples: string[]
  loci: { id: string; gene: string; variantCount: number }[]
}

// A dataset whose catalogue came out of the tier ranking rather than out of a
// curated list. Read off the loci rather than off "no manifest was passed":
// those coincide today, and only one of them is the actual question — a
// dataset could have summaries generated for derived loci, and HPRC rendered
// without its manifest is still curated.
function isDerived(dataset: PangenomeDataset) {
  return dataset.loci.every(l => l.derived !== undefined)
}

// What a card counts, and what the sort orders by. `variants` needs a manifest;
// `segments` needs only the catalogue.
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

const filterLabel = (f: Filter) => (f === 'all' ? 'All' : VARIATION_LABELS[f])

const matchesFilter = (l: PangenomeLocus, f: Filter) =>
  f === 'all' || l.variation.includes(f)

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
  // ?locus=<id>, ?filter=<class>, ?sort=<mode> all deep-link via useUrlState so a
  // shared URL restores the full grid view (back/forward included); each param is
  // dropped when it equals its default. Unknown param values fall back to the
  // default rather than breaking the view.
  const [selectedId, setSelectedId] = useUrlState('locus', loci[0]?.id ?? '')
  const [rawFilter, setRawFilter] = useUrlState('filter', 'all')
  const [rawSort, setRawSort] = useUrlState('sort', 'catalog')
  const filter = FILTERS.find(f => f === rawFilter) ?? 'all'
  const sort = SORTS.find(s => s.value === rawSort)?.value ?? 'catalog'

  // Per-locus counts, shown on the cards so the grid is informative before you
  // drill in.
  const counts = cardCounts(dataset, manifest)

  const visible = loci
    .filter(l => matchesFilter(l, filter))
    .sort((a, b) =>
      sort === 'count'
        ? (counts.of.get(b.id) ?? 0) - (counts.of.get(a.id) ?? 0)
        : 0,
    )
  // An unknown ?locus= falls back to the first card, and the grid highlights
  // what the dashboard actually shows rather than the id in the url.
  const selected = loci.find(l => l.id === selectedId) ?? loci[0]
  const activeId = selected ? selected.id : ''

  // Keep the dashboard in sync with the grid: if a new filter would hide the
  // selected locus, jump to the first locus that survives it (no effect needed —
  // the selection change happens in the same click that changes the filter).
  const applyFilter = (f: Filter) => {
    setRawFilter(f)
    if (selected && !matchesFilter(selected, f)) {
      const first = loci.find(l => matchesFilter(l, f))
      if (first) {
        setSelectedId(first.id)
      }
    }
  }

  return (
    <div>
      <p>
        {dataset.reference.label} loci where structure varies between the
        assemblies in the {dataset.label} graph ({dataset.panelDescription}),
        with JBrowse launches. The graph files and assemblies are on{' '}
        <a href={`/pangenomes#${dataset.id}`}>the pangenomes page</a>.
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

      <div className="pg-filters">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`pg-filter${filter === f ? ' pg-filter-active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => {
              applyFilter(f)
            }}
          >
            {filterLabel(f)}
          </button>
        ))}
        <span className="pg-filter-spacer" />
        {SORTS.map(s => (
          <button
            key={s.value}
            className={`pg-filter${sort === s.value ? ' pg-filter-active' : ''}`}
            aria-pressed={sort === s.value}
            onClick={() => {
              setRawSort(s.value)
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="pg-grid">
        {visible.map(l => {
          const n = counts.of.get(l.id)
          return (
            <button
              key={l.id}
              className={`pg-card${l.id === activeId ? ' pg-card-active' : ''}`}
              aria-pressed={l.id === activeId}
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
