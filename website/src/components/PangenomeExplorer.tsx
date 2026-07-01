import { useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import PangenomeLocusDashboard from './PangenomeLocusDashboard.tsx'
import PangenomeVariationBadges from './PangenomeVariationBadges.tsx'
import { VARIATION_LABELS } from './pangenomeLoci.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import { fetchJson } from '../lib/fetchJson.ts'

import type { PangenomeDataset } from './pangenomeDataset.ts'
import type { PangenomeLocus, VariationClass } from './pangenomeLoci.ts'

type Filter = VariationClass | 'all'

const FILTERS: Filter[] = [
  'all',
  'cnv',
  'pav',
  'hyperdiversity',
  'vntr',
  'inversion',
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
  // ?locus=<id> deep-links a region; useUrlState keeps it in sync (back/forward
  // included) and drops the param when it equals the default.
  const [selectedId, setSelectedId] = useUrlState('locus', loci[0]?.id ?? '')
  const [filter, setFilter] = useState<Filter>('all')

  // Precomputed per-locus variant counts, shown on the cards so the grid is
  // informative before you drill in. Optional — cards render fine without it.
  const { data: manifest } = useSWRImmutable<Manifest>(
    `${dataset.dataPrefix}/manifest.json`,
    fetchJson,
  )
  const variantCount = new Map(
    manifest?.loci.map(l => [l.id, l.variantCount]),
  )

  const visible = loci.filter(l => matchesFilter(l, filter))
  const selected = loci.find(l => l.id === selectedId) ?? loci[0]

  // Keep the dashboard in sync with the grid: if a new filter would hide the
  // selected locus, jump to the first locus that survives it (no effect needed —
  // the selection change happens in the same click that changes the filter).
  const applyFilter = (f: Filter) => {
    setFilter(f)
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
