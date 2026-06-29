import { useState } from 'react'

import PangenomeLocusDashboard from './PangenomeLocusDashboard.tsx'
import PangenomeVariationBadges from './PangenomeVariationBadges.tsx'
import { PANGENOME_LOCI, VARIATION_LABELS } from './pangenomeLoci.ts'
import { useUrlState } from '../hooks/useUrlState.ts'

import type { VariationClass } from './pangenomeLoci.ts'

type Filter = VariationClass | 'all'

const FILTERS: Filter[] = [
  'all',
  'cnv',
  'pav',
  'hyperdiversity',
  'vntr',
  'inversion',
]

const filterLabel = (f: Filter) => (f === 'all' ? 'All' : VARIATION_LABELS[f])

const DEFAULT_LOCUS_ID = PANGENOME_LOCI[0]?.id ?? ''

export default function PangenomeExplorer() {
  // ?locus=<id> deep-links a region; useUrlState keeps it in sync (back/forward
  // included) and drops the param when it equals the default.
  const [selectedId, setSelectedId] = useUrlState('locus', DEFAULT_LOCUS_ID)
  const [filter, setFilter] = useState<Filter>('all')

  const visible = PANGENOME_LOCI.filter(
    l => filter === 'all' || l.variation.includes(filter),
  )
  const selected =
    PANGENOME_LOCI.find(l => l.id === selectedId) ?? PANGENOME_LOCI[0]

  return (
    <div>
      <div className="pg-filters">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`pg-filter${filter === f ? ' pg-filter-active' : ''}`}
            onClick={() => {
              setFilter(f)
            }}
          >
            {filterLabel(f)}
          </button>
        ))}
      </div>

      <div className="pg-grid">
        {visible.map(l => (
          <button
            key={l.id}
            className={`pg-card${l.id === selectedId ? ' pg-card-active' : ''}`}
            onClick={() => {
              setSelectedId(l.id)
            }}
          >
            <span className="pg-card-gene">{l.gene}</span>
            <span className="pg-card-fullname">{l.fullName}</span>
            <PangenomeVariationBadges variation={l.variation} />
          </button>
        ))}
      </div>

      {selected && <PangenomeLocusDashboard locus={selected} />}
    </div>
  )
}
