import { useMemo, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import OrthologResultsTable from './OrthologResultsTable.tsx'
import {
  COMMON_SPECIES,
  buildOrthologResults,
  createStore,
} from './orthologSearchUtils.ts'

import type {
  AssemblyIndex,
  NcbiOrthologResponse,
  OrthologResult,
} from './orthologSearchUtils.ts'

interface ResolvedGene {
  geneId: string
  symbol: string
  species: string
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export default function OrthologSearch() {
  const [geneInput, setGeneInput] = useState('')
  const [taxId, setTaxId] = useState(9606)
  const [resolved, setResolved] = useState<ResolvedGene | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<OrthologResult[] | null>(null)
  const [totalOrthologs, setTotalOrthologs] = useState(0)

  const { data: indexData } = useSWRImmutable<AssemblyIndex>(
    '/ortholog_index.json',
    fetchJson,
  )

  const { data: syntenyPairs } = useSWRImmutable<Record<string, string>>(
    '/synteny_pairs.json',
    fetchJson,
  )

  const store = useMemo(
    () => (indexData ? createStore(indexData) : null),
    [indexData],
  )

  async function handleSearch() {
    const query = geneInput.trim()
    if (!query || !store) {
      return
    }
    setLoading(true)
    setError('')
    setResults(null)
    try {
      let geneId = ''
      if (/^\d+$/.test(query)) {
        geneId = query
      } else {
        const taxFilter = taxId ? `+AND+${taxId}[taxid]` : ''
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${encodeURIComponent(query)}[Gene+Name]${taxFilter}&retmode=json&retmax=1`
        const searchRes = await fetchJson<{
          esearchresult?: { idlist?: string[] }
        }>(searchUrl)
        const ids = searchRes.esearchresult?.idlist ?? []
        if (ids.length === 0) {
          setError(
            `No gene found for "${query}"${taxId ? ` in taxon ${taxId}` : ''}.`,
          )
          return
        }
        geneId = ids[0] ?? ''
      }

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`
      const summaryRes = await fetchJson<{
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
      })

      const orthologUrl = `https://api.ncbi.nlm.nih.gov/datasets/v2/gene/id/${geneId}/orthologs?returned_content=COMPLETE`
      const orthologRes = await fetchJson<NcbiOrthologResponse>(orthologUrl)
      const reports = orthologRes.reports ?? []
      setTotalOrthologs(orthologRes.total_count ?? reports.length)
      setResults(buildOrthologResults(reports, store))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const refAccession = results?.find(r => r.assembly.taxonId === taxId)
    ?.assembly.accession

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
                void handleSearch()
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
            void handleSearch()
          }}
          disabled={!store || loading || !geneInput.trim()}
          className="orthologs-search-btn"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

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
