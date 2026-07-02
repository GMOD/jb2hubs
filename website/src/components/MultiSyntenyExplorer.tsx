import { useMemo, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import MultiSyntenyView from './MultiSyntenyView.tsx'
import { type Neighborhood } from './neighborhood.ts'
import { getNeighborhood } from './neighborhoodClient.ts'
import { COMMON_SPECIES } from './orthologSearchUtils.ts'
import { resolveRefTaxon } from './orthologSet.ts'
import { features } from '../config/features.ts'

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

// The submitted query drives the SWR key; the raw reference string (a taxid or a
// species name) is resolved to a taxon id inside the fetcher.
interface Query {
  gene: string
  ref: string
  maxAnchors: number
  flankBp: number
}

// Neighbor-gene counts and reference windows offered in the form. maxAnchors
// includes the query gene; flankBp is the search window each side of it.
const ANCHOR_CHOICES = [7, 11, 15, 21]
const FLANK_CHOICES = [
  { label: '±100 kb', bp: 100_000 },
  { label: '±150 kb', bp: 150_000 },
  { label: '±300 kb', bp: 300_000 },
  { label: '±500 kb', bp: 500_000 },
]

// A friendly label for a reference stored as a bare taxid, so the input shows
// "Human" rather than "9606" when arriving from a taxid URL.
function labelForRef(ref: string) {
  return COMMON_SPECIES.find(s => String(s.taxId) === ref)?.label ?? ref
}

// Initial gene/reference come from the URL (?gene=BRCA1&ref=9606) so a view is
// shareable/bookmarkable; this is a client:only island, so window is available.
function paramsFromUrl(): Query {
  const p = new URLSearchParams(window.location.search)
  const anchors = Number(p.get('anchors'))
  const flank = Number(p.get('flank'))
  return {
    gene: p.get('gene')?.trim() ?? 'BRCA1',
    ref: p.get('ref')?.trim() ?? '9606',
    maxAnchors: ANCHOR_CHOICES.includes(anchors) ? anchors : 11,
    flankBp: FLANK_CHOICES.some(f => f.bp === flank) ? flank : 150_000,
  }
}

export default function MultiSyntenyExplorer() {
  const initial = paramsFromUrl()
  const [geneInput, setGeneInput] = useState(initial.gene)
  const [refInput, setRefInput] = useState(() => labelForRef(initial.ref))
  const [anchors, setAnchors] = useState(initial.maxAnchors)
  const [flankBp, setFlankBp] = useState(initial.flankBp)
  const [query, setQuery] = useState<Query>(initial)

  // SWR fetches on mount from the URL-derived key and again whenever the query
  // changes — no effect needed. keepPreviousData holds the current view on screen
  // (no flicker) while the next one loads.
  const { data, error, isValidating } = useSWRImmutable(
    query.gene
      ? ['neighborhood', query.gene, query.ref, query.maxAnchors, query.flankBp]
      : null,
    async ([, gene, ref, maxAnchors, flank]) =>
      getNeighborhood(gene, await resolveRefTaxon(ref), {
        maxAnchors,
        flankBp: flank,
      }),
    { keepPreviousData: true, revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const trimmed = useMemo(() => (data ? trim(data) : null), [data])
  const nb = trimmed?.nb ?? null
  const eligible = trimmed?.eligible ?? 0
  const loading = isValidating

  const run = (gene: string, ref: string) => {
    const g = gene.trim()
    if (g) {
      setGeneInput(g)
      setQuery({ gene: g, ref, maxAnchors: anchors, flankBp })
      const params = new URLSearchParams({
        gene: g,
        ref,
        anchors: String(anchors),
        flank: String(flankBp),
      })
      window.history.replaceState(null, '', `?${params.toString()}`)
    }
  }

  return (
    <div>
      <div className="msv-form">
        <input
          value={geneInput}
          onChange={e => {
            setGeneInput(e.target.value)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              run(geneInput, refInput)
            }
          }}
          placeholder="Gene symbol, e.g. BRCA1"
          disabled={loading}
        />
        <input
          list="msv-ref-species"
          value={refInput}
          onChange={e => {
            setRefInput(e.target.value)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              run(geneInput, refInput)
            }
          }}
          placeholder="Reference species or taxid"
          disabled={loading}
          title="Any species name or NCBI taxon id — common species are suggested"
        />
        <datalist id="msv-ref-species">
          {COMMON_SPECIES.map(s => (
            <option
              key={s.taxId}
              value={s.label}
            />
          ))}
        </datalist>
        <select
          value={anchors}
          onChange={e => {
            setAnchors(Number(e.target.value))
          }}
          disabled={loading}
          title="How many genes to show: the query gene plus its nearest protein-coding neighbors"
        >
          {ANCHOR_CHOICES.map(n => (
            <option
              key={n}
              value={n}
            >
              {n} genes
            </option>
          ))}
        </select>
        <select
          value={flankBp}
          onChange={e => {
            setFlankBp(Number(e.target.value))
          }}
          disabled={loading}
          title="Search window each side of the query gene for neighbor genes"
        >
          {FLANK_CHOICES.map(f => (
            <option
              key={f.bp}
              value={f.bp}
            >
              {f.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            run(geneInput, refInput)
          }}
          disabled={loading || !geneInput.trim() || !refInput.trim()}
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
              run(g, refInput)
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
      {error && (
        <p className="msv-error">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      {nb?.species.length === 0 && !loading && (
        <p className="msv-hint">No informative ortholog neighborhoods found.</p>
      )}
      {nb && eligible > nb.species.length && (
        <p className="msv-hint">
          Showing the {nb.species.length} species nearest the reference of{' '}
          {eligible} with orthologs here.
        </p>
      )}
      {nb && nb.species.length > 0 && (
        <p className="msv-hint">
          <a
            href={`/orthologs?gene=${encodeURIComponent(nb.query.symbol)}&ref=${nb.query.refTaxonId}`}
          >
            View the full ortholog table for {nb.query.symbol} →
          </a>
          {features.proteinMsa && (
            <>
              {' · '}
              <a
                href={`/protein-alignment?gene=${encodeURIComponent(nb.query.symbol)}&ref=${nb.query.refTaxonId}`}
              >
                protein alignment & domains →
              </a>
            </>
          )}
        </p>
      )}
      {nb && nb.species.length > 0 && <MultiSyntenyView neighborhood={nb} />}
    </div>
  )
}
