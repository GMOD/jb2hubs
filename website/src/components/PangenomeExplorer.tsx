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
export interface PangenomeManifest {
  samples: string[]
  loci: { id: string; gene: string; variantCount: number }[]
}

const filterLabel = (f: Filter) => (f === 'all' ? 'All' : VARIATION_LABELS[f])

const matchesFilter = (l: PangenomeLocus, f: Filter) =>
  f === 'all' || l.variation.includes(f)

// Only a dataset with a locus catalog can be explored; the mouse strains on
// /pangenomes#mouse have none yet.
const EXPLORABLE = PANGENOME_DATASETS.filter(d => d.loci.length > 0)

function LocusGrid({
  dataset,
  manifest,
}: {
  dataset: PangenomeDataset
  manifest: PangenomeManifest
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

  // Precomputed per-locus variant counts, shown on the cards so the grid is
  // informative before you drill in.
  const variantCount = new Map(manifest.loci.map(l => [l.id, l.variantCount]))

  const visible = loci
    .filter(l => matchesFilter(l, filter))
    .sort((a, b) =>
      sort === 'count'
        ? (variantCount.get(b.id) ?? 0) - (variantCount.get(a.id) ?? 0)
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
        {dataset.reference.label} loci where structure varies between haplotypes
        (copy number, gene presence/absence, tandem repeats, inversions,
        hypervariable immune regions), from the {dataset.label} graph (
        {manifest.samples.length} samples), with JBrowse launches. The graph
        files and sample assemblies are on{' '}
        <a href={`/pangenomes#${dataset.id}`}>the pangenomes page</a>.
      </p>

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
          const n = variantCount.get(l.id)
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
                  {n.toLocaleString()} variants
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
  const manifest = dataset && manifests[dataset.id]

  return dataset === undefined || manifest === undefined ? (
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
      ) : (
        <p className="pg-hint">
          {dataset.label} is the only dataset with a locus catalog so far; the{' '}
          <a href="/pangenomes#mouse">mouse strain assemblies</a> have no
          pangenome VCF or curated loci wired up yet.
        </p>
      )}
      <LocusGrid
        key={dataset.id}
        dataset={dataset}
        manifest={manifest}
      />
    </div>
  )
}
