import '../styles/ui.css'

import { useMemo, useState, useSyncExternalStore } from 'react'

import useSWRImmutable from 'swr/immutable'

import { features } from '../config/features.ts'
import { useUrlState } from '../hooks/useUrlState.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorMessage from './ErrorMessage.tsx'
import MultiSyntenyView from './MultiSyntenyView.tsx'
import { loadDrilldownData } from './multiSyntenyDrilldown.ts'
import {
  ANCHOR_CHOICES,
  DEFAULT_FLANK_BP,
  DEFAULT_MAX_ANCHORS,
  FLANK_CHOICES_BP,
  type Neighborhood,
} from './neighborhood.ts'
import { getNeighborhood } from './neighborhoodClient.ts'
import { COMMON_SPECIES, geneUrl, refLabel } from './orthologSearchUtils.ts'
import { resolveRefTaxon } from './orthologSet.ts'

import type { FormEvent } from 'react'

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

function choice(choices: number[], raw: string, fallback: number) {
  const n = Number(raw)
  return choices.includes(n) ? n : fallback
}

// A reference the page can resolve without a request — a taxon id, or one of
// the suggested species — as the taxon id string; anything else as typed, for
// the fetcher to look up. Keying the fetch on this rather than the raw text is
// what makes `human`, `Human` and `9606` one fetch instead of three.
function localRef(ref: string) {
  const q = ref.trim()
  const known = COMMON_SPECIES.find(
    s => s.label.toLowerCase() === q.toLowerCase(),
  )
  return /^\d+$/.test(q) ? q : known ? String(known.taxId) : q
}

function field(fd: FormData, name: string) {
  const v = fd.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

// False for the server render and the hydrating one, true after. The URL hooks
// answer their defaults until hydration completes, and a fetch keyed on those
// would spend a request on BRCA1 for every deep link to some other gene.
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

// The URL is the query: ?gene=BRCA1&ref=9606&anchors=11&flank=150000, the
// `?gene=&ref=` half being the contract the gene-first pages share. Submitting
// writes it (with the reference resolved to a taxon id first) and the fetch is
// keyed on what it says, so a view is shareable and back/forward work.
export default function MultiSyntenyExplorer() {
  const hydrated = useHydrated()
  const [geneParam, setGeneParam] = useUrlState('gene', 'BRCA1')
  const [refParam, setRefParam] = useUrlState('ref', '9606')
  const [anchorsParam, setAnchorsParam] = useUrlState(
    'anchors',
    String(DEFAULT_MAX_ANCHORS),
  )
  const [flankParam, setFlankParam] = useUrlState(
    'flank',
    String(DEFAULT_FLANK_BP),
  )
  const gene = geneParam.trim()
  const ref = localRef(refParam)
  const maxAnchors = choice(ANCHOR_CHOICES, anchorsParam, DEFAULT_MAX_ANCHORS)
  const flankBp = choice(FLANK_CHOICES_BP, flankParam, DEFAULT_FLANK_BP)

  const [refError, setRefError] = useState<unknown>(undefined)

  // SWR supersedes a stale key on its own, so the form stays live while a
  // build is in flight; keepPreviousData holds the current figure on screen
  // until the next one lands.
  const { data, error, isValidating } = useSWRImmutable(
    hydrated && gene ? ['neighborhood', gene, ref, maxAnchors, flankBp] : null,
    async ([, g, r, a, f]) =>
      getNeighborhood(g, await resolveRefTaxon(r), {
        maxAnchors: a,
        flankBp: f,
      }),
    { ...LIVE_QUERY, keepPreviousData: true, revalidateOnFocus: false },
  )
  // The pair catalog and assembly index behind every drill-down, fetched once
  // the neighborhood is on screen so the figure's genes render as real links.
  const { data: drilldown } = useSWRImmutable(
    data ? 'multi-synteny-drilldown' : null,
    loadDrilldownData,
  )
  const trimmed = useMemo(() => (data ? trim(data) : null), [data])
  const nb = error ? null : trimmed?.nb
  const eligible = trimmed?.eligible ?? 0
  const loading = isValidating

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(
      e.currentTarget,
      e.nativeEvent instanceof SubmitEvent ? e.nativeEvent.submitter : null,
    )
    const example = field(fd, 'example')
    const g = example ? example : field(fd, 'gene')
    const refText = field(fd, 'ref')
    if (g && refText) {
      try {
        const taxId = await resolveRefTaxon(refText)
        setRefError(undefined)
        setGeneParam(g)
        setRefParam(String(taxId))
        setAnchorsParam(field(fd, 'anchors'))
        setFlankParam(field(fd, 'flank'))
      } catch (err) {
        setRefError(err)
      }
    }
  }

  return (
    <div>
      <form
        onSubmit={e => {
          void submit(e)
        }}
      >
        <div className="ui-form">
          <input
            key={gene}
            name="gene"
            className="ui-input"
            defaultValue={gene}
            placeholder="Gene symbol, e.g. BRCA1"
            required
          />
          <input
            key={refParam}
            name="ref"
            className="ui-input"
            list="msv-ref-species"
            defaultValue={refLabel(refParam)}
            placeholder="Reference species or taxid"
            required
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
            key={maxAnchors}
            name="anchors"
            className="ui-select"
            defaultValue={maxAnchors}
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
            key={flankBp}
            name="flank"
            className="ui-select"
            defaultValue={flankBp}
            title="Search window each side of the query gene for neighbor genes"
          >
            {FLANK_CHOICES_BP.map(bp => (
              <option
                key={bp}
                value={bp}
              >
                ±{bp / 1000} kb
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="ui-btn"
          >
            {loading ? 'Building…' : 'Build'}
          </button>
        </div>

        <div className="msv-examples">
          <span>Examples:</span>
          {EXAMPLES.map(g => (
            <button
              key={g}
              type="submit"
              name="example"
              value={g}
              className="ui-chip-btn"
            >
              {g}
            </button>
          ))}
        </div>
      </form>

      {loading && (
        <p className="ui-hint">
          Building the {gene} neighborhood. A gene someone has looked at before
          lands in about a second; the first build of a gene takes 10–20 s of
          NCBI lookups and is then cached for everyone.
        </p>
      )}
      <ErrorMessage
        error={refError}
        className="ui-error"
      />
      <ErrorMessage
        error={error}
        className="ui-error"
      />
      {nb?.species.length === 0 && !loading && (
        <p className="ui-hint">No informative ortholog neighborhoods found.</p>
      )}
      {nb && eligible > nb.species.length && (
        <p className="ui-hint">
          Showing the {nb.species.length} species nearest the reference of{' '}
          {eligible} with orthologs here.
        </p>
      )}
      {nb && nb.species.length > 0 && (
        <p className="ui-hint">
          <a href={geneUrl('/orthologs', nb.query.symbol, nb.query.refTaxonId)}>
            View the full ortholog table for {nb.query.symbol} →
          </a>
          {features.proteinBrowser && (
            <>
              {' · '}
              <a
                href={geneUrl(
                  '/protein-browser',
                  nb.query.symbol,
                  nb.query.refTaxonId,
                )}
              >
                protein browser →
              </a>
            </>
          )}
        </p>
      )}
      {nb && nb.species.length > 0 && (
        <MultiSyntenyView
          neighborhood={nb}
          drilldown={drilldown}
        />
      )}
    </div>
  )
}
