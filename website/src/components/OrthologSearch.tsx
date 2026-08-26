import { useEffect, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { features } from '../config/features.ts'
import { ncbiGeneUrl, ncbiTaxonomyUrl } from '../lib/externalLinks.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import ErrorMessage from './ErrorMessage.tsx'
import OrthologHelpDialog from './OrthologHelpDialog.tsx'
import OrthologResultsTable from './OrthologResultsTable.tsx'
import { fetchTaxonAncestors } from './multiSyntenyTaxonTree.ts'
import { fetchOrthologReports, ncbiJson } from './ncbiFetch.ts'
import { ORTHOLOG_SCOPES, scopeById } from './orthologClades.ts'
import { loadStore } from './orthologDb.ts'
import {
  COMMON_SPECIES,
  buildOrthologResults,
  geneUrl,
  orthologSearchUrl,
  refLabel,
} from './orthologSearchUtils.ts'
import { resolveGeneId, resolveRefTaxon } from './orthologSet.ts'
import { buildPairIndex } from './syntenyPairIndex.ts'

import type { OrthologScope } from './orthologClades.ts'
import type { NcbiOrthologResponse } from './orthologSearchUtils.ts'
import type { PairEntry } from './syntenyPairIndex.ts'

// What NCBI's gene summary tells us about the query gene itself. All of it is in
// one call we were already making and mostly throwing away — the description and
// the alias list are what turn a bare symbol into something a reader can confirm
// they searched for the right gene.
interface GeneSummary {
  name?: string
  description?: string
  maplocation?: string
  otheraliases?: string
  organism?: { scientificname?: string; commonname?: string; taxid?: number }
}

// One whole search, from a gene symbol and a free-text reference organism to the
// ortholog rows. Takes the assembly store from the shared module-level loader
// rather than as an argument, so a search submitted before the (~4 MB) index has
// landed just waits for it. Failures throw; SWR surfaces them as `error`.
async function searchOrthologs(
  gene: string,
  ref: string,
  scope: OrthologScope,
) {
  // Free text — a name or a taxon id — so the reference organism isn't limited
  // to the suggested model organisms. Throws when NCBI taxonomy knows no such
  // organism, which surfaces in the error line below.
  const tax = await resolveRefTaxon(ref)
  const geneId = await resolveGeneId(gene, tax)
  if (!geneId) {
    throw new Error(
      `No gene found for "${gene}"${tax ? ` in taxon ${tax}` : ''}.`,
    )
  }

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`
  const [store, summaryRes, orthologRes] = await Promise.all([
    loadStore(),
    ncbiJson<{ result?: Record<string, GeneSummary> }>(summaryUrl),
    fetchOrthologReports<NcbiOrthologResponse>(geneId, scope.taxa),
  ])
  const summary = summaryRes.result?.[geneId] ?? {}
  const reports = orthologRes.reports ?? []
  // The gene's OWN organism, not the one that was typed. A numeric GeneID names
  // one gene in one species outright, so a search for 12189 with the box left on
  // its Human default is a mouse search — and calling human the reference there
  // would put the "ref" marker on the wrong row and window every synteny launch
  // against the wrong genome.
  const refTaxId = summary.organism?.taxid ?? tax
  // Only now that the gene resolved: a search that is about to error should not
  // leave a link to itself in the address bar.
  window.history.replaceState(
    null,
    '',
    orthologSearchUrl(summary.name ?? gene, refTaxId, scope.id),
  )
  return {
    resolved: {
      geneId,
      symbol: summary.name ?? gene,
      description: summary.description ?? '',
      mapLocation: summary.maplocation ?? '',
      aliases: (summary.otheraliases ?? '')
        .split(',')
        .map(a => a.trim())
        .filter(Boolean),
      species: summary.organism?.scientificname ?? '',
      commonName: summary.organism?.commonname ?? '',
      refTaxId,
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
  const [scopeInput, setScopeInput] = useState(scopeById('all').id)
  // The submitted search, as opposed to what is currently typed: this is the SWR
  // key, so it changes only when a search is asked for, not on every keystroke.
  const [submitted, setSubmitted] = useState<[string, string, string] | null>(
    null,
  )
  const [helpOpen, setHelpOpen] = useState(false)

  // Warms the assembly index on mount; searchOrthologs awaits the same cached
  // store itself, so a search submitted before this lands simply waits.
  const { data: store } = useSWRImmutable('ortholog-store', loadStore)

  const { data: syntenyPairs } = useSWRImmutable(
    '/synteny_pairs.json',
    fetchJson<Record<string, PairEntry>>,
  )

  const {
    data: search,
    error,
    isLoading: loading,
  } = useSWRImmutable(
    submitted && (['orthologs', ...submitted] as const),
    ([, gene, ref, scope]) => searchOrthologs(gene, ref, scopeById(scope)),
    LIVE_QUERY,
  )

  function runSearch(rawQuery: string, rawRef: string, scope: string) {
    const gene = rawQuery.trim()
    const ref = rawRef.trim()
    if (gene && ref) {
      setGeneInput(gene)
      setRefInput(ref)
      setScopeInput(scope)
      setSubmitted([gene, ref, scope])
    }
  }
  const submit = () => {
    runSearch(geneInput, refInput, scopeInput)
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
    const scope = scopeById(p.get('scope')).id
    setRefInput(ref)
    setScopeInput(scope)
    if (gene) {
      setGeneInput(gene)
      setSubmitted([gene, ref, scope])
    }
  }, [])

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
          disabled={loading}
          placeholder="e.g. BRCA1 or 672"
        />
        <SearchField
          id="species-input"
          label="Reference species"
          className="orthologs-select"
          value={refInput}
          onChange={setRefInput}
          onSubmit={submit}
          disabled={loading}
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
        <div className="orthologs-field">
          <label
            htmlFor="scope-input"
            className="orthologs-label"
          >
            Limit to
          </label>
          <select
            id="scope-input"
            className="orthologs-select"
            value={scopeInput}
            onChange={e => {
              setScopeInput(e.target.value)
            }}
            disabled={loading}
            title="Ask NCBI for orthologs in one clade only — a smaller, faster answer than every species"
          >
            {ORTHOLOG_SCOPES.map(s => (
              <option
                key={s.id}
                value={s.id}
              >
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={submit}
          disabled={loading || !geneInput.trim() || !refInput.trim()}
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
        {['BRCA1', 'TP53', 'SHH'].map(g => (
          <button
            key={g}
            onClick={() => {
              runSearch(g, 'Human', scopeInput)
            }}
            disabled={loading}
            className="orthologs-chip"
          >
            {g}
          </button>
        ))}
      </p>

      {!store && !search && (
        <p className="orthologs-hint">Loading assembly index…</p>
      )}

      <ErrorMessage
        error={error}
        className="orthologs-error"
      />

      {search && (
        <SearchResults
          {...search}
          scope={scopeById(submitted?.[2])}
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

// What the gene actually is, from the summary call the search already makes. A
// symbol alone doesn't tell you whether you got the gene you meant; the
// description, the cytogenetic band and the alias list do.
function GeneCard({ resolved }: { resolved: SearchResult['resolved'] }) {
  const { symbol, description, species, commonName, mapLocation, geneId } =
    resolved
  return (
    <div className="orthologs-gene-card">
      <h2 className="orthologs-gene-title">
        {symbol}
        {description ? (
          <span className="orthologs-gene-desc"> {description}</span>
        ) : null}
      </h2>
      <p className="orthologs-gene-meta">
        {species ? <em>{species}</em> : `taxon ${resolved.refTaxId}`}
        {commonName ? ` (${commonName})` : ''}
        {mapLocation ? ` · ${mapLocation}` : ''}
        {' · '}
        <a
          href={ncbiGeneUrl(geneId)}
          target="_blank"
          rel="noreferrer"
        >
          NCBI Gene {geneId}
        </a>
        {' · '}
        <a
          href={ncbiTaxonomyUrl(resolved.refTaxId)}
          target="_blank"
          rel="noreferrer"
        >
          taxonomy
        </a>
      </p>
      {resolved.aliases.length > 0 && (
        <p className="orthologs-gene-aliases">
          Also known as {resolved.aliases.join(', ')}
        </p>
      )}
    </div>
  )
}

function SearchResults({
  resolved,
  results,
  totalOrthologs,
  scope,
  syntenyPairs,
}: SearchResult & {
  scope: OrthologScope
  syntenyPairs: Record<string, PairEntry> | undefined
}) {
  const { symbol, refTaxId } = resolved
  const refResult = results.find(r => r.assembly.taxonId === refTaxId)

  // Root-to-taxon lineages for the species in this answer, which is what lets
  // the table group its rows by clade. Fetched separately, and after the rows
  // are already on screen: it is another second of NCBI, and a table that is
  // readable-but-ungrouped beats a blank page. Keyed off the search rather than
  // the taxon list so the key stays short. A failure leaves `data` undefined and
  // the table renders one flat group — there is no error to show a reader here,
  // because nothing they asked for is missing.
  const { data: lineages } = useSWRImmutable(
    results.length > 0 ? ['lineages', symbol, refTaxId, scope.id] : null,
    () => fetchTaxonAncestors(results.map(r => r.assembly.taxonId)),
    LIVE_QUERY,
  )

  const pairIndex = syntenyPairs ? buildPairIndex(syntenyPairs) : undefined

  return (
    <div>
      <GeneCard resolved={resolved} />
      {totalOrthologs > 0 && (
        <p className="orthologs-summary">
          {results.length} of {totalOrthologs} NCBI ortholog
          {totalOrthologs === 1 ? '' : 's'}
          {scope.taxa.length > 0 ? ` in ${scope.label.toLowerCase()}` : ''}{' '}
          present in our collection
        </p>
      )}
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
          {totalOrthologs > 0
            ? 'NCBI lists orthologs for this gene, but we host none of their genomes'
            : 'NCBI lists no orthologs for this gene'}
          {scope.taxa.length > 0 ? ` within ${scope.label.toLowerCase()}` : ''}.
        </p>
      ) : (
        <OrthologResultsTable
          results={results}
          refResult={refResult}
          pairIndex={pairIndex}
          lineages={lineages}
        />
      )}
    </div>
  )
}
