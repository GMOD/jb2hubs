import { useState } from 'react'

import MultiSyntenyView from './MultiSyntenyView.tsx'
import { type Neighborhood } from './neighborhood.ts'
import { getNeighborhood } from './neighborhoodClient.ts'
import { COMMON_SPECIES } from './orthologSearchUtils.ts'

// Rows with too few anchors carry little synteny signal and just lengthen the
// view, so the explorer keeps the most informative species (tree order intact).
const MIN_ANCHORS = 2
const MAX_SPECIES = 80

// Keep informative, tree-ordered rows. When there are more than fit, take the
// window CENTERED on the reference species rather than the head of the list:
// tree order runs basal->derived, so a head-slice of a human query would be all
// fish and omit the human reference itself. Centering shows the reference plus
// its closest relatives — the meaningful comparison — and keeps adjacent-row
// ribbons phylogenetically tight. The cladogram auto-prunes to whatever remains.
function trim(nb: Neighborhood): Neighborhood {
  const eligible = nb.species.filter(s => s.genes.length >= MIN_ANCHORS)
  if (eligible.length <= MAX_SPECIES) {
    return { ...nb, species: eligible }
  }
  const refIdx = eligible.findIndex(s => s.taxonId === nb.query.refTaxonId)
  const center = refIdx >= 0 ? refIdx : 0
  const start = Math.min(
    Math.max(0, center - Math.floor(MAX_SPECIES / 2)),
    eligible.length - MAX_SPECIES,
  )
  return { ...nb, species: eligible.slice(start, start + MAX_SPECIES) }
}

export default function MultiSyntenyExplorer() {
  const [gene, setGene] = useState('BRCA1')
  const [taxId, setTaxId] = useState(9606)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nb, setNb] = useState<Neighborhood | null>(null)

  async function run() {
    const query = gene.trim()
    if (!query) {
      return
    }
    setLoading(true)
    setError('')
    setNb(null)
    try {
      setNb(trim(await getNeighborhood(query, taxId)))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="msv-form">
        <input
          value={gene}
          onChange={e => {
            setGene(e.target.value)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              void run()
            }
          }}
          placeholder="Gene symbol, e.g. BRCA1"
          disabled={loading}
        />
        <select
          value={taxId}
          onChange={e => {
            setTaxId(Number(e.target.value))
          }}
          disabled={loading}
        >
          {COMMON_SPECIES.map(s => (
            <option
              key={s.taxId}
              value={s.taxId}
            >
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            void run()
          }}
          disabled={loading || !gene.trim()}
        >
          {loading ? 'Building…' : 'Build'}
        </button>
      </div>

      {loading && (
        <p className="msv-hint">
          Querying NCBI orthologs + neighbors across species (throttled)…
        </p>
      )}
      {error && <p className="msv-error">{error}</p>}
      {nb && nb.species.length === 0 && (
        <p className="msv-hint">No informative ortholog neighborhoods found.</p>
      )}
      {nb && nb.species.length > 0 && <MultiSyntenyView neighborhood={nb} />}
    </div>
  )
}
