import { useEffect, useMemo, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import OrthologHelpDialog from './OrthologHelpDialog.tsx'
import OrthologResultsTable from './OrthologResultsTable.tsx'
import { fetchOrthologReports, ncbiJson } from './ncbiFetch.ts'
import {
  COMMON_SPECIES,
  buildOrthologResults,
  createStore,
  refLabel,
} from './orthologSearchUtils.ts'
import { resolveGeneId, resolveRefTaxon } from './orthologSet.ts'
import { features } from '../config/features.ts'
import { fetchJson } from '../lib/fetchJson.ts'

import type {
  AssemblyIndex,
  NcbiOrthologResponse,
  OrthologResult,
} from './orthologSearchUtils.ts'

interface ResolvedGene {
  geneId: string
  symbol: string
  species: string
  refTaxId: number
}

// The SWR-loaded index files use the shared fetchJson; NCBI calls below go
// through the shared throttled client (ncbiJson) instead.
export default function OrthologSearch() {
  const [geneInput, setGeneInput] = useState('')
  const [refInput, setRefInput] = useState('Human')
  const [resolved, setResolved] = useState<ResolvedGene | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<OrthologResult[] | null>(null)
  const [totalOrthologs, setTotalOrthologs] = useState(0)
  const [initialized, setInitialized] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const { data: indexData } = useSWRImmutable(
    '/ortholog_index.json',
    fetchJson<AssemblyIndex>,
  )

  const { data: syntenyPairs } = useSWRImmutable(
    '/synteny_pairs.json',
    fetchJson<Record<string, string>>,
  )

  const store = useMemo(
    () => (indexData ? createStore(indexData) : null),
    [indexData],
  )

  async function runSearch(rawQuery: string, rawRef: string) {
    const query = rawQuery.trim()
    if (!query || !rawRef.trim() || !store) {
      return
    }
    setGeneInput(query)
    setRefInput(rawRef)
    setLoading(true)
    setError('')
    setResults(null)
    try {
      // Free text — a name or a taxon id — so the reference organism isn't
      // limited to the suggested model organisms. Throws when NCBI taxonomy
      // knows no such organism, which surfaces in the error line below.
      const tax = await resolveRefTaxon(rawRef)
      // Keep the address bar in sync with what's on screen so a search is
      // shareable/bookmarkable — the mount effect below reads these back. The
      // resolved taxon id goes in the URL, not the typed text, so the link means
      // the same thing later.
      window.history.replaceState(
        null,
        '',
        `?gene=${encodeURIComponent(query)}&ref=${tax}`,
      )
      const geneId = await resolveGeneId(query, tax)
      if (!geneId) {
        setError(
          `No gene found for "${query}"${tax ? ` in taxon ${tax}` : ''}.`,
        )
        return
      }

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`
      const summaryRes = await ncbiJson<{
        result?: Record<
          string,
          { name?: string; organism?: { scientificname?: string } }
        >
      }>(summaryUrl)
      const summary = summaryRes.result?.[geneId] ?? {}
      setResolved({
        geneId,
        symbol: summary.name ?? query,
        species: summary.organism?.scientificname ?? '',
        refTaxId: tax,
      })

      const orthologRes =
        await fetchOrthologReports<NcbiOrthologResponse>(geneId)
      const reports = orthologRes.reports ?? []
      setTotalOrthologs(orthologRes.total_count ?? reports.length)
      setResults(buildOrthologResults(reports, store))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // Honour a shared/bookmarked link once the assembly index (store) is ready.
  // ?ref= alone is the accession page's "orthologs for this species" link: it
  // sets the reference and waits for a gene, rather than being ignored and
  // leaving the box on its Human default. ?gene= additionally runs the search
  // (the back-link from the conserved-gene-order and protein-browser views).
  // Client-only: this island is client:load, so window is unavailable until mount.
  useEffect(() => {
    if (store && !initialized) {
      setInitialized(true)
      const p = new URLSearchParams(window.location.search)
      const g = p.get('gene')?.trim()
      const r = p.get('ref')?.trim()
      const ref = r ? refLabel(r) : refInput
      if (r) {
        setRefInput(ref)
      }
      if (g) {
        void runSearch(g, ref)
      }
    }
  }, [store, initialized])

  const refAccession = results?.find(
    r => r.assembly.taxonId === resolved?.refTaxId,
  )?.assembly.accession

  return (
    <div>
      <div className="orthologs-controls">
        <div className="orthologs-field">
          <label
            htmlFor="gene-input"
            className="orthologs-label"
          >
            Gene symbol
          </label>
          <input
            id="gene-input"
            type="text"
            value={geneInput}
            onChange={e => {
              setGeneInput(e.target.value)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                void runSearch(geneInput, refInput)
              }
            }}
            placeholder="e.g. BRCA1 or 672"
            disabled={!store || loading}
            className="orthologs-input"
          />
        </div>
        <div className="orthologs-field">
          <label
            htmlFor="species-input"
            className="orthologs-label"
          >
            Reference species
          </label>
          <input
            id="species-input"
            type="text"
            list="ortholog-ref-species"
            value={refInput}
            onChange={e => {
              setRefInput(e.target.value)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                void runSearch(geneInput, refInput)
              }
            }}
            placeholder="Species name or taxid"
            title="Any species name or NCBI taxon id — common model organisms are suggested"
            disabled={!store || loading}
            className="orthologs-select"
          />
          <datalist id="ortholog-ref-species">
            {COMMON_SPECIES.map(s => (
              <option
                key={s.taxId}
                value={s.label}
              />
            ))}
          </datalist>
        </div>
        <button
          onClick={() => {
            void runSearch(geneInput, refInput)
          }}
          disabled={!store || loading || !geneInput.trim() || !refInput.trim()}
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
            void runSearch('BRCA1', 'Human')
          }}
          disabled={!store || loading}
          className="orthologs-chip"
        >
          BRCA1
        </button>
      </p>

      {!store && <p className="orthologs-hint">Loading assembly index…</p>}

      {error && <p className="orthologs-error">{error}</p>}

      {results !== null && (
        <div>
          <p className="orthologs-summary">
            {resolved && (
              <>
                <strong>{resolved.symbol}</strong>
                {resolved.species ? ` (${resolved.species})` : ''}
                {' · '}
                <a
                  href={`https://www.ncbi.nlm.nih.gov/gene/${resolved.geneId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  NCBI Gene {resolved.geneId}
                </a>
                {' · '}
              </>
            )}
            {results.length} of {totalOrthologs} NCBI ortholog
            {totalOrthologs !== 1 ? 's' : ''} present in our collection
          </p>
          {resolved && features.multiSynteny && (
            <p className="orthologs-summary">
              <a
                href={`/conserved-gene-order?gene=${encodeURIComponent(resolved.symbol)}&ref=${resolved.refTaxId}`}
              >
                View conserved gene order for {resolved.symbol} across species →
              </a>{' '}
              (the ortholog neighborhood, drawn as gene-order ribbons)
            </p>
          )}
          {resolved && features.proteinBrowser && (
            <p className="orthologs-summary">
              <a
                href={`/protein-browser?gene=${encodeURIComponent(resolved.symbol)}&ref=${resolved.refTaxId}`}
              >
                View the ortholog protein browser for {resolved.symbol} →
              </a>{' '}
              (domain architecture, residue alignment, and 3D structure)
            </p>
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
      )}
    </div>
  )
}
