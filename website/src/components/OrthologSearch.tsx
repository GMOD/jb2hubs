import { useEffect, useMemo, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import OrthologResultsTable from './OrthologResultsTable.tsx'
import { fetchOrthologReports, ncbiJson } from './ncbiFetch.ts'
import {
  COMMON_SPECIES,
  buildOrthologResults,
  createStore,
} from './orthologSearchUtils.ts'
import { resolveGeneId } from './orthologSet.ts'
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
  const [taxId, setTaxId] = useState(9606)
  const [resolved, setResolved] = useState<ResolvedGene | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<OrthologResult[] | null>(null)
  const [totalOrthologs, setTotalOrthologs] = useState(0)
  const [initialized, setInitialized] = useState(false)

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

  async function runSearch(rawQuery: string, tax: number) {
    const query = rawQuery.trim()
    if (!query || !store) {
      return
    }
    setGeneInput(query)
    setTaxId(tax)
    // Keep the address bar in sync with what's on screen so a search is
    // shareable/bookmarkable — the mount effect below reads these back.
    window.history.replaceState(
      null,
      '',
      `?gene=${encodeURIComponent(query)}&ref=${tax}`,
    )
    setLoading(true)
    setError('')
    setResults(null)
    try {
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

  // Honour a shared/bookmarked link (?gene=BRCA1&ref=9606) — e.g. the back-link
  // from the conserved-gene-order view — by auto-searching once the assembly
  // index (store) is ready. Client-only: this island is client:load, so window
  // is unavailable until mount.
  useEffect(() => {
    if (store && !initialized) {
      setInitialized(true)
      const p = new URLSearchParams(window.location.search)
      const g = p.get('gene')?.trim()
      const r = Number(p.get('ref'))
      if (g) {
        void runSearch(g, r > 0 ? r : taxId)
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
                void runSearch(geneInput, taxId)
              }
            }}
            placeholder="e.g. BRCA1 or 672"
            disabled={!store || loading}
            className="orthologs-input"
          />
        </div>
        <div className="orthologs-field">
          <label
            htmlFor="species-select"
            className="orthologs-label"
          >
            Reference species
          </label>
          <select
            id="species-select"
            value={taxId}
            onChange={e => {
              setTaxId(Number(e.target.value))
            }}
            disabled={!store || loading}
            className="orthologs-select"
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
        </div>
        <button
          onClick={() => {
            void runSearch(geneInput, taxId)
          }}
          disabled={!store || loading || !geneInput.trim()}
          className="orthologs-search-btn"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      <p className="orthologs-hint">
        Try an example:{' '}
        <button
          onClick={() => {
            void runSearch('BRCA1', 9606)
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
          {resolved && features.proteinMsa && (
            <p className="orthologs-summary">
              <a
                href={`/protein-alignment?gene=${encodeURIComponent(resolved.symbol)}&ref=${resolved.refTaxId}`}
              >
                View the ortholog protein alignment for {resolved.symbol} →
              </a>{' '}
              (residue conservation + conserved-domain architecture)
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
