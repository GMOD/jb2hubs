import useSWRImmutable from 'swr/immutable'

import PangenomeLocusDashboard from './PangenomeLocusDashboard.tsx'
import PangenomeVariationBadges from './PangenomeVariationBadges.tsx'
import { VARIATION_LABELS } from './pangenomeLoci.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import { fetchJson } from '../lib/fetchJson.ts'

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

interface Manifest {
  samples: string[]
  loci: { id: string; gene: string; variantCount: number }[]
}

const filterLabel = (f: Filter) => (f === 'all' ? 'All' : VARIATION_LABELS[f])

const matchesFilter = (l: PangenomeLocus, f: Filter) =>
  f === 'all' || l.variation.includes(f)

export default function PangenomeExplorer({
  dataset,
}: {
  dataset: PangenomeDataset
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
  // informative before you drill in. Optional — cards render fine without it.
  const { data: manifest } = useSWRImmutable<Manifest>(
    `${dataset.dataPrefix}/manifest.json`,
    fetchJson,
  )
  const variantCount = new Map(manifest?.loci.map(l => [l.id, l.variantCount]))

  // "Most variants" needs the manifest counts; until it loads the comparator
  // returns 0, leaving the stable catalog order in place.
  const visible = loci
    .filter(l => matchesFilter(l, filter))
    .sort((a, b) =>
      sort === 'count'
        ? (variantCount.get(b.id) ?? 0) - (variantCount.get(a.id) ?? 0)
        : 0,
    )
  const selected = loci.find(l => l.id === selectedId) ?? loci[0]

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
              className={`pg-card${l.id === selectedId ? ' pg-card-active' : ''}`}
              aria-pressed={l.id === selectedId}
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
