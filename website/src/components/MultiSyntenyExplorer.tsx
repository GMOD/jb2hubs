import { useEffect, useState } from 'react'

import MultiSyntenyView from './MultiSyntenyView.tsx'
import { type Neighborhood } from './neighborhood.ts'
import { getNeighborhood } from './neighborhoodClient.ts'
import { COMMON_SPECIES } from './orthologSearchUtils.ts'

// Rows with too few anchors carry little synteny signal and just lengthen the
// view, so the explorer keeps the most informative species (tree order intact).
const MIN_ANCHORS = 2
const MAX_SPECIES = 80

// Curated showcase genes (human): two with vertebrate gene-order rearrangements
// (BRCA1 across sharks/rays, TP53), and two textbook conserved clusters whose
// neighbors are the rest of the cluster — the beta-globin and HOXA clusters.
const EXAMPLES = ['BRCA1', 'TP53', 'HBB', 'HOXA13']

// Keep informative, tree-ordered rows. When there are more than fit, take the
// window CENTERED on the reference species rather than the head of the list:
// tree order runs basal->derived, so a head-slice of a human query would be all
// fish and omit the human reference itself. Centering shows the reference plus
// its closest relatives — the meaningful comparison — and keeps adjacent-row
// ribbons phylogenetically tight. The cladogram auto-prunes to whatever remains.
// Returns the trimmed neighborhood plus how many species were eligible, so the
// caller can disclose when the cap hid some.
function trim(nb: Neighborhood): { nb: Neighborhood; eligible: number } {
  const eligible = nb.species.filter(s => s.genes.length >= MIN_ANCHORS)
  if (eligible.length <= MAX_SPECIES) {
    return { nb: { ...nb, species: eligible }, eligible: eligible.length }
  }
  const refIdx = eligible.findIndex(s => s.taxonId === nb.query.refTaxonId)
  const center = refIdx >= 0 ? refIdx : 0
  const start = Math.min(
    Math.max(0, center - Math.floor(MAX_SPECIES / 2)),
    eligible.length - MAX_SPECIES,
  )
  return {
    nb: { ...nb, species: eligible.slice(start, start + MAX_SPECIES) },
    eligible: eligible.length,
  }
}

// Initial gene/reference come from the URL (?gene=BRCA1&ref=9606) so a view is
// shareable/bookmarkable; this is a client:only island, so window is available.
function paramsFromUrl() {
  const p = new URLSearchParams(window.location.search)
  const ref = Number(p.get('ref'))
  return { gene: p.get('gene')?.trim() ?? 'BRCA1', ref: ref > 0 ? ref : 9606 }
}

export default function MultiSyntenyExplorer() {
  const [gene, setGene] = useState(() => paramsFromUrl().gene)
  const [taxId, setTaxId] = useState(() => paramsFromUrl().ref)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nb, setNb] = useState<Neighborhood | null>(null)
  const [eligible, setEligible] = useState(0)

  // Keeps the current view on screen while the next loads (no flicker), so a
  // showcase gene swaps in place.
  const run = async (query: string, ref: number) => {
    const q = query.trim()
    if (q) {
      setGene(q)
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ gene: q, ref: String(ref) })
      window.history.replaceState(null, '', `?${params.toString()}`)
      try {
        const trimmed = trim(await getNeighborhood(q, ref))
        setNb(trimmed.nb)
        setEligible(trimmed.eligible)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
  }

  // Populate from the URL (or the BRCA1 default) on arrival so the page
  // demonstrates itself and honours a shared link.
  useEffect(() => {
    void run(gene, taxId)
  }, [])

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
              void run(gene, taxId)
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
            void run(gene, taxId)
          }}
          disabled={loading || !gene.trim()}
        >
          {loading ? 'Building…' : 'Build'}
        </button>
      </div>

      <div className="msv-examples">
        <span>Examples:</span>
        {EXAMPLES.map(g => (
          <button
            key={g}
            className="msv-example-chip"
            disabled={loading}
            onClick={() => {
              void run(g, taxId)
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {loading && (
        <p className="msv-hint">
          Querying NCBI orthologs + neighbors across species…
        </p>
      )}
      {error && <p className="msv-error">{error}</p>}
      {nb?.species.length === 0 && !loading && (
        <p className="msv-hint">No informative ortholog neighborhoods found.</p>
      )}
      {nb && eligible > nb.species.length && (
        <p className="msv-hint">
          Showing the {nb.species.length} species nearest the reference of{' '}
          {eligible} with orthologs here.
        </p>
      )}
      {nb && nb.species.length > 0 && <MultiSyntenyView neighborhood={nb} />}
    </div>
  )
}
