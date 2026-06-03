import { useMemo, useState } from 'react'
import useSWRImmutable from 'swr/immutable'

// [commonName, scientificName, taxonId]
type OrthologEntry = [string, string, number]
type OrthologIndex = Record<string, OrthologEntry>

const COMMON_SPECIES = [
  { label: 'Human', taxId: 9606 },
  { label: 'Mouse', taxId: 10090 },
  { label: 'Rat', taxId: 10116 },
  { label: 'Zebrafish', taxId: 7955 },
  { label: 'Chicken', taxId: 9031 },
  { label: 'Dog', taxId: 9615 },
  { label: 'Cow', taxId: 9913 },
  { label: 'Pig', taxId: 9823 },
  { label: 'Frog (X. tropicalis)', taxId: 8364 },
  { label: 'Fruitfly', taxId: 7227 },
  { label: 'C. elegans', taxId: 6239 },
  { label: 'Yeast (S. cerevisiae)', taxId: 4932 },
  { label: 'Arabidopsis', taxId: 3702 },
]

const COMMON_TAX_RANK = new Map(COMMON_SPECIES.map((s, i) => [s.taxId, i]))

interface NcbiOrthologGene {
  gene_id: string
  symbol: string
  taxname: string
  common_name?: string
  annotations?: {
    assembly_accession: string
    assembly_name: string
    genomic_locations?: {
      genomic_accession_version: string
      sequence_name: string
      genomic_range?: {
        begin: string
        end: string
      }
    }[]
  }[]
}

interface NcbiOrthologReport {
  gene: NcbiOrthologGene
}

interface NcbiOrthologResponse {
  reports?: NcbiOrthologReport[]
  total_count?: number
}

interface OrthologResult {
  accession: string
  commonName: string
  scientificName: string
  geneSymbol: string
  geneId: string
  taxname: string
  taxonId: number
  chromosome: string
  begin: number
  end: number
  locStr: string
  jbrowseUrl: string
}

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

function accessionToJbrowseUrl(accession: string, loc?: string) {
  const [base, rest] = accession.split('_') as [string, string]
  const digits = rest.replace(/\.\d+$/, '')
  const b1 = digits.slice(0, 3)
  const b2 = digits.slice(3, 6)
  const b3 = digits.slice(6, 9)
  const configPath = `${base}/${b1}/${b2}/${b3}/${accession}/config.json`
  const url = `https://jbrowse.org/code/jb2/latest/?config=/hubs/genark/${configPath}`
  if (!loc) {
    return url
  }
  return `${url}&loc=${encodeURIComponent(loc)}`
}

function accessionBase(accession: string) {
  return accession.replace(/\.\d+$/, '')
}

const MERGE_API =
  'https://0hifvzakej.execute-api.us-east-1.amazonaws.com/merge'

function orthoSyntenyUrl(
  refAccession: string,
  r: OrthologResult,
  trackId: string,
) {
  const mergeApiUrl = `${MERGE_API}?hubIds=${r.accession},${refAccession}`
  const sessionSpec = {
    views: [
      {
        type: 'LinearSyntenyView',
        tracks: [trackId],
        views: [
          { assembly: r.accession, loc: r.locStr },
          { assembly: refAccession },
        ],
      },
    ],
  }
  return `https://jbrowse.org/code/jb2/main/?config=${encodeURIComponent(mergeApiUrl)}&session=spec-${encodeURIComponent(JSON.stringify(sessionSpec))}`
}

interface ResultRowProps {
  result: OrthologResult
  isRef: boolean
  syntenyUrl: string | null
}

function ResultRow({ result: r, isRef, syntenyUrl }: ResultRowProps) {
  return (
    <tr>
      <td>
        <em>{r.scientificName}</em>
        {r.commonName ? ` (${r.commonName})` : ''}
      </td>
      <td>
        <a
          href={`https://www.ncbi.nlm.nih.gov/gene/${r.geneId}`}
          target="_blank"
          rel="noreferrer"
        >
          {r.geneSymbol}
        </a>
      </td>
      <td>
        <a href={`/accession/${r.accession}`}>{r.accession}</a>
      </td>
      <td className="orthologs-loc">
        chr{r.chromosome}:{r.begin.toLocaleString()}–{r.end.toLocaleString()}
      </td>
      <td className="orthologs-actions">
        <a href={r.jbrowseUrl} target="_blank" rel="noreferrer">
          JBrowse
        </a>
        {isRef && <span className="orthologs-ref-label">ref</span>}
        {syntenyUrl && (
          <>
            {' · '}
            <a href={syntenyUrl} target="_blank" rel="noreferrer">
              Synteny
            </a>
          </>
        )}
      </td>
    </tr>
  )
}

export default function OrthologSearch() {
  const [geneInput, setGeneInput] = useState('')
  const [taxId, setTaxId] = useState(9606)
  const [resolved, setResolved] = useState<ResolvedGene | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<OrthologResult[] | null>(null)
  const [totalOrthologs, setTotalOrthologs] = useState(0)

  const { data: index } = useSWRImmutable<OrthologIndex>(
    '/ortholog_index.json',
    fetchJson,
  )

  const { data: syntenyPairs } = useSWRImmutable<Record<string, string>>(
    '/synteny_pairs.json',
    fetchJson,
  )

  const baseIndex = useMemo(
    () =>
      index
        ? new Map(
            Object.entries(index).map(([acc, v]) => [
              accessionBase(acc),
              [acc, v] as [string, OrthologEntry],
            ]),
          )
        : null,
    [index],
  )

  async function handleSearch() {
    const query = geneInput.trim()
    if (!query || !index || !baseIndex) {
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
          setLoading(false)
          return
        }
        geneId = ids[0] ?? ''
      }

      // Always fetch summary so numeric IDs also get a resolved gene name
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

      const matched: OrthologResult[] = []
      for (const { gene } of reports) {
        for (const ann of gene.annotations ?? []) {
          const apiAccession = ann.assembly_accession
          const entry =
            index[apiAccession] ??
            baseIndex.get(accessionBase(apiAccession))?.[1]
          const resolvedAccession =
            index[apiAccession] != null
              ? apiAccession
              : (baseIndex.get(accessionBase(apiAccession))?.[0] ??
                apiAccession)

          if (!entry) {
            continue
          }
          const loc = ann.genomic_locations?.[0]
          if (!loc?.genomic_range) {
            continue
          }
          const begin = parseInt(loc.genomic_range.begin)
          const end = parseInt(loc.genomic_range.end)
          const locStr = `${loc.genomic_accession_version}:${begin}-${end}`
          matched.push({
            accession: resolvedAccession,
            commonName: entry[0],
            scientificName: entry[1],
            geneSymbol: gene.symbol,
            geneId: gene.gene_id,
            taxname: gene.taxname,
            taxonId: entry[2],
            chromosome: loc.sequence_name,
            begin,
            end,
            locStr,
            jbrowseUrl: accessionToJbrowseUrl(resolvedAccession, locStr),
          })
          break
        }
      }

      matched.sort((a, b) => {
        const ar = COMMON_TAX_RANK.get(a.taxonId) ?? Infinity
        const br = COMMON_TAX_RANK.get(b.taxonId) ?? Infinity
        if (ar !== br) {
          return ar - br
        }
        return a.scientificName.localeCompare(b.scientificName)
      })
      setResults(matched)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const refAccession = results?.find(r => r.taxonId === taxId)?.accession
  const indexLoaded = index != null

  function syntenyTrackId(orthoAccession: string) {
    if (!syntenyPairs || !refAccession) {
      return null
    }
    return (
      syntenyPairs[`${orthoAccession},${refAccession}`] ??
      syntenyPairs[`${refAccession},${orthoAccession}`] ??
      null
    )
  }

  return (
    <div>
      <div className="orthologs-controls">
        <div className="orthologs-field">
          <label htmlFor="gene-input" className="orthologs-label">
            Gene symbol or NCBI Gene ID
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
            disabled={!indexLoaded || loading}
            className="orthologs-input"
          />
        </div>
        <div className="orthologs-field">
          <label htmlFor="species-select" className="orthologs-label">
            Reference species
          </label>
          <select
            id="species-select"
            value={taxId}
            onChange={e => {
              setTaxId(Number(e.target.value))
            }}
            disabled={!indexLoaded || loading}
            className="orthologs-select"
          >
            {COMMON_SPECIES.map(s => (
              <option key={s.taxId} value={s.taxId}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            void handleSearch()
          }}
          disabled={!indexLoaded || loading || !geneInput.trim()}
          className="orthologs-search-btn"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {!indexLoaded && (
        <p className="orthologs-hint">Loading assembly index…</p>
      )}

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
            {results.length} of {totalOrthologs} ortholog
            {totalOrthologs !== 1 ? 's' : ''} in our collection
          </p>
          {results.length === 0 ? (
            <p className="orthologs-hint">
              No orthologs found in our assembly collection for this gene.
            </p>
          ) : (
            <table className="orthologs-table">
              <thead>
                <tr>
                  <th>Species</th>
                  <th>Gene</th>
                  <th>Assembly</th>
                  <th>Location</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.flatMap((r, i) => {
                  const isRef = r.accession === refAccession
                  const trackId = isRef ? null : syntenyTrackId(r.accession)
                  const syntenyUrl =
                    trackId && refAccession
                      ? orthoSyntenyUrl(refAccession, r, trackId)
                      : null
                  const isLastCommon =
                    COMMON_TAX_RANK.has(r.taxonId) &&
                    i + 1 < results.length &&
                    !COMMON_TAX_RANK.has(results[i + 1]!.taxonId)

                  const rows = [
                    <ResultRow
                      key={r.accession}
                      result={r}
                      isRef={isRef}
                      syntenyUrl={syntenyUrl}
                    />,
                  ]
                  if (isLastCommon) {
                    rows.push(
                      <tr key={`divider-${i}`} className="orthologs-divider">
                        <td colSpan={5} />
                      </tr>,
                    )
                  }
                  return rows
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
