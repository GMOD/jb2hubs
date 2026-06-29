import { Suspense, lazy, useEffect, useState } from 'react'

import { COMMON_SPECIES } from './orthologSearchUtils.ts'
import { type ProteinMsaResult, assembleProteinMsa } from './proteinMsa.ts'

// react-msaview pulls in @jbrowse/core + MUI + mobx and renders to canvas, so it
// only runs client-side; lazy-loading keeps it off the first paint.
const MSAViewer = lazy(() =>
  import('react-msaview').then(m => ({ default: m.MSAViewer })),
)

// Genes with clear, textbook multi-domain architecture, so the domain overlay
// reads immediately.
const EXAMPLES = ['TP53', 'BRCA2', 'EGFR', 'SOD1']

// client:only island, so window is available for the shareable ?gene=&ref= link.
function paramsFromUrl() {
  const p = new URLSearchParams(window.location.search)
  const ref = Number(p.get('ref'))
  return { gene: p.get('gene')?.trim() ?? 'TP53', ref: ref > 0 ? ref : 9606 }
}

export default function ProteinMsaExplorer() {
  const [gene, setGene] = useState(() => paramsFromUrl().gene)
  const [taxId, setTaxId] = useState(() => paramsFromUrl().ref)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<ProteinMsaResult | null>(null)

  const run = async (query: string, ref: number) => {
    const sym = query.trim()
    if (sym) {
      setGene(sym)
      setTaxId(ref)
      setLoading(true)
      setError('')
      const params = new URLSearchParams({ gene: sym, ref: String(ref) })
      window.history.replaceState(null, '', `?${params.toString()}`)
      try {
        setResult(await assembleProteinMsa(sym, ref, { onProgress: setStatus }))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
  }

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
          placeholder="Gene symbol, e.g. TP53"
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
        <p className="msv-hint">{status || 'Building…'}</p>
      )}
      {error && <p className="msv-error">{error}</p>}

      {result && !loading && (
        <>
          <p className="msv-hint">
            {result.rows.length} species ·{' '}
            <a
              href={`/orthologs?gene=${encodeURIComponent(result.query.symbol)}&ref=${result.query.refTaxonId}`}
            >
              ortholog table
            </a>{' '}
            ·{' '}
            <a
              href={`/conserved-gene-order?gene=${encodeURIComponent(result.query.symbol)}&ref=${result.query.refTaxonId}`}
            >
              conserved gene order
            </a>
          </p>
          <Suspense
            fallback={<p className="msv-hint">Loading alignment viewer…</p>}
          >
            <MSAViewer
              msa={result.fasta}
              tree={result.newick}
              gff={result.gff}
              colorScheme="clustalx_protein_dynamic"
              height={520}
            />
          </Suspense>
        </>
      )}
    </div>
  )
}
