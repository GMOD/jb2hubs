import { useEffect, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { features } from '../config/features.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorMessage from './ErrorMessage.tsx'
import OrthologHelpDialog from './OrthologHelpDialog.tsx'
import OrthologResultsTable from './OrthologResultsTable.tsx'
import { fetchOrthologReports, ncbiJson } from './ncbiFetch.ts'
import {
  COMMON_SPECIES,
  buildOrthologResults,
  geneUrl,
  loadStore,
  refLabel,
  syncGeneUrl,
} from './orthologSearchUtils.ts'
import { resolveGeneId, resolveRefTaxon } from './orthologSet.ts'

import type { NcbiOrthologResponse } from './orthologSearchUtils.ts'

// One whole search, from a gene symbol and a free-text reference organism to the
// ortholog rows. Takes the assembly store from the shared module-level loader
// rather than as an argument, so a search submitted before the (~4 MB) index has
// landed just waits for it. Failures throw; SWR surfaces them as `error`.
async function searchOrthologs(gene: string, ref: string) {
  // Free text — a name or a taxon id — so the reference organism isn't limited
  // to the suggested model organisms. Throws when NCBI taxonomy knows no such
  // organism, which surfaces in the error line below.
  const tax = await resolveRefTaxon(ref)
  // The mount effect below reads this back, so a search survives a reload.
  syncGeneUrl(gene, tax)
  const geneId = await resolveGeneId(gene, tax)
  if (!geneId) {
    throw new Error(
      `No gene found for "${gene}"${tax ? ` in taxon ${tax}` : ''}.`,
    )
  }

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`
  const [store, summaryRes, orthologRes] = await Promise.all([
    loadStore(),
    ncbiJson<{
      result?: Record<
        string,
        { name?: string; organism?: { scientificname?: string } }
      >
    }>(summaryUrl),
    fetchOrthologReports<NcbiOrthologResponse>(geneId),
  ])
  const summary = summaryRes.result?.[geneId] ?? {}
  const reports = orthologRes.reports ?? []
  return {
    resolved: {
      geneId,
      symbol: summary.name ?? gene,
      species: summary.organism?.scientificname ?? '',
      refTaxId: tax,
    },
    totalOrthologs: orthologRes.total_count ?? reports.length,
    results: buildOrthologResults(reports, store),
  }
}

type SearchResult = Awaited<ReturnType<typeof searchOrthologs>>

// The index and the search are both SWR-keyed; the NCBI calls inside the search
// go through the shared throttled client (ncbiJson) instead.
export default function OrthologSearch() {
  const [geneInput, setGeneInput] = useState('')
  const [refInput, setRefInput] = useState('Human')
  // The submitted search, as opposed to what is currently typed: this is the SWR
  // key, so it changes only when a search is asked for, not on every keystroke.
  const [submitted, setSubmitted] = useState<[string, string] | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  // Warms the assembly index on mount and gates the form; searchOrthologs awaits
  // the same cached store itself.
  const { data: store } = useSWRImmutable('ortholog-store', loadStore)

  const { data: syntenyPairs } = useSWRImmutable(
    '/synteny_pairs.json',
    fetchJson<Record<string, string>>,
  )

  const {
    data: search,
    error,
    isLoading: loading,
  } = useSWRImmutable(
    submitted && (['orthologs', ...submitted] as const),
    ([, gene, ref]) => searchOrthologs(gene, ref),
    LIVE_QUERY,
  )

  function runSearch(rawQuery: string, rawRef: string) {
    const gene = rawQuery.trim()
    const ref = rawRef.trim()
    if (gene && ref) {
      setGeneInput(gene)
      setRefInput(ref)
      setSubmitted([gene, ref])
    }
  }
  const submit = () => {
    runSearch(geneInput, refInput)
  }

  // Honour a shared/bookmarked link. ?ref= alone is the accession page's
  // "orthologs for this species" link: it sets the reference and waits for a
  // gene, rather than being ignored and leaving the box on its Human default.
  // ?gene= additionally submits the search (the back-link from the
  // conserved-gene-order and protein-browser views). Deferred to an effect
  // because this island is client:load, so window is unavailable until mount.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const gene = p.get('gene')?.trim()
    const ref = refLabel(p.get('ref')?.trim() ?? 'Human')
    setRefInput(ref)
    if (gene) {
      setGeneInput(gene)
      setSubmitted([gene, ref])
    }
  }, [])

  const busy = !store || loading

  return (
    <div>
      <div className="orthologs-controls">
        <SearchField
          id="gene-input"
          label="Gene symbol"
          className="orthologs-input"
          value={geneInput}
          onChange={setGeneInput}
          onSubmit={submit}
          disabled={busy}
          placeholder="e.g. BRCA1 or 672"
        />
        <SearchField
          id="species-input"
          label="Reference species"
          className="orthologs-select"
          value={refInput}
          onChange={setRefInput}
          onSubmit={submit}
          disabled={busy}
          placeholder="Species name or taxid"
          title="Any species name or NCBI taxon id — common model organisms are suggested"
          list="ortholog-ref-species"
        >
          <datalist id="ortholog-ref-species">
            {COMMON_SPECIES.map(s => (
              <option
                key={s.taxId}
                value={s.label}
              />
            ))}
          </datalist>
        </SearchField>
        <button
          onClick={submit}
          disabled={busy || !geneInput.trim() || !refInput.trim()}
          className="orthologs-search-btn"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
        <button
          onClick={() => {
            setHelpOpen(true)
          }}
          className="orthologs-help-btn"
          title="How this search works"
          aria-label="How this search works"
        >
          ?
        </button>
      </div>

      {helpOpen && (
        <OrthologHelpDialog
          onClose={() => {
            setHelpOpen(false)
          }}
        />
      )}

      <p className="orthologs-hint">
        Try an example:{' '}
        <button
          onClick={() => {
            runSearch('BRCA1', 'Human')
          }}
          disabled={busy}
          className="orthologs-chip"
        >
          BRCA1
        </button>
      </p>

      {!store && <p className="orthologs-hint">Loading assembly index…</p>}

      <ErrorMessage
        error={error}
        className="orthologs-error"
      />

      {search && (
        <SearchResults
          {...search}
          syntenyPairs={syntenyPairs}
        />
      )}
    </div>
  )
}

// A labelled text box that submits on Enter. `children` carries the optional
// <datalist> the reference-species box needs alongside its input.
function SearchField({
  id,
  label,
  className,
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  title,
  list,
  children,
}: {
  id: string
  label: string
  className: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
  placeholder: string
  title?: string
  list?: string
  children?: React.ReactNode
}) {
  return (
    <div className="orthologs-field">
      <label
        htmlFor={id}
        className="orthologs-label"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        list={list}
        value={value}
        onChange={e => {
          onChange(e.target.value)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            onSubmit()
          }
        }}
        placeholder={placeholder}
        title={title}
        disabled={disabled}
        className={className}
      />
      {children}
    </div>
  )
}

// One "keep going with this gene over on that page" line.
function CrossLink({
  href,
  text,
  note,
}: {
  href: string
  text: string
  note: string
}) {
  return (
    <p className="orthologs-summary">
      <a href={href}>{text} →</a> ({note})
    </p>
  )
}

function SearchResults({
  resolved,
  results,
  totalOrthologs,
  syntenyPairs,
}: SearchResult & { syntenyPairs: Record<string, string> | undefined }) {
  const { symbol, species, geneId, refTaxId } = resolved
  const refAccession = results.find(r => r.assembly.taxonId === refTaxId)
    ?.assembly.accession

  return (
    <div>
      <p className="orthologs-summary">
        <strong>{symbol}</strong>
        {species ? ` (${species})` : ''}
        {' · '}
        <a
          href={`https://www.ncbi.nlm.nih.gov/gene/${geneId}`}
          target="_blank"
          rel="noreferrer"
        >
          NCBI Gene {geneId}
        </a>
        {' · '}
        {results.length} of {totalOrthologs} NCBI ortholog
        {totalOrthologs === 1 ? '' : 's'} present in our collection
      </p>
      {features.multiSynteny && (
        <CrossLink
          href={geneUrl('/conserved-gene-order', symbol, refTaxId)}
          text={`View conserved gene order for ${symbol} across species`}
          note="the ortholog neighborhood, drawn as gene-order ribbons"
        />
      )}
      {features.proteinBrowser && (
        <CrossLink
          href={geneUrl('/protein-browser', symbol, refTaxId)}
          text={`View the ortholog protein browser for ${symbol}`}
          note="domain architecture, residue alignment, and 3D structure"
        />
      )}
      {results.length === 0 ? (
        <p className="orthologs-hint">
          No orthologs found in our assembly collection for this gene.
        </p>
      ) : (
        <OrthologResultsTable
          results={results}
          refAccession={refAccession}
          syntenyPairs={syntenyPairs}
        />
      )}
    </div>
  )
}
