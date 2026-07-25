import { useEffect, useState } from 'react'

import {
  type GeneStructure,
  type InlineMsa,
  buildSessionUrl,
  fetchGeneStructure,
  geneStats,
} from './geneStructure.ts'
import { COMMON_SPECIES } from './orthologSearchUtils.ts'
import {
  type ProteinPanel,
  alignProteinPanel,
  assembleProteinPanel,
} from './proteinMsa.ts'

// Textbook genes present across the model organisms, chosen to resolve in NCBI
// and carry an AlphaFold structure.
const EXAMPLES = ['TP53', 'BRCA2', 'EGFR', 'SOD1', 'SHH', 'PAX6']

// client:only island, so window is available for the shareable ?gene=&ref= link.
function paramsFromUrl() {
  const p = new URLSearchParams(window.location.search)
  const ref = Number(p.get('ref'))
  return { gene: p.get('gene')?.trim() ?? '', ref: ref > 0 ? ref : 9606 }
}

export default function ProteinBrowser() {
  const [gene, setGene] = useState(() => paramsFromUrl().gene)
  const [taxId, setTaxId] = useState(() => paramsFromUrl().ref)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [structure, setStructure] = useState<GeneStructure | null>(null)
  const [collapse, setCollapse] = useState(true)
  const [inlineMsa, setInlineMsa] = useState<InlineMsa | null>(null)
  const [aligning, setAligning] = useState(false)

  // Resolve the gene to its structure (genome model + AlphaFold accession). The
  // alignment is built separately, on demand.
  const run = async (query: string, ref: number) => {
    const sym = query.trim()
    if (sym) {
      setGene(sym)
      setTaxId(ref)
      setError('')
      setStructure(null)
      setInlineMsa(null)
      const params = new URLSearchParams({ gene: sym, ref: String(ref) })
      window.history.replaceState(null, '', `?${params.toString()}`)
      setLoading(true)
      try {
        setStructure(await fetchGeneStructure(sym, ref))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
  }

  // Build the cross-species ortholog alignment (NCBI orthologs + EBI Clustal
  // Omega, with CDD domains) and fold it into the session as a connected MsaView.
  const buildAlignment = async (s: GeneStructure) => {
    setAligning(true)
    setError('')
    try {
      const panel: ProteinPanel = await assembleProteinPanel(
        s.symbol,
        s.taxId,
        {
          onProgress: setStatus,
        },
      )
      const queryRow =
        panel.rows.find(r => r.taxId === s.taxId) ?? panel.rows[0]
      if (!queryRow) {
        throw new Error('no ortholog rows to align')
      }
      const alignment = await alignProteinPanel(panel, {
        onProgress: setStatus,
      })
      setInlineMsa({
        fasta: alignment.fasta,
        newick: alignment.newick,
        gff: alignment.gff,
        querySeqName: queryRow.label,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAligning(false)
    }
  }

  useEffect(() => {
    if (gene) {
      void run(gene, taxId)
    }
  }, [])

  const speciesName =
    COMMON_SPECIES.find(s => s.taxId === taxId)?.label ?? String(taxId)

  return (
    <div>
      <div className="msv-form">
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
          placeholder={`Gene symbol in ${speciesName}, e.g. TP53`}
          disabled={loading}
        />
        <button
          onClick={() => {
            void run(gene, taxId)
          }}
          disabled={loading || !gene.trim()}
        >
          {loading ? 'Resolving…' : 'Explore'}
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

      {loading && <p className="msv-hint">{status || 'Resolving gene…'}</p>}
      {error && <p className="msv-error">{error}</p>}

      {structure && !loading && (
        <ResultCard
          structure={structure}
          collapse={collapse}
          onToggleCollapse={setCollapse}
          inlineMsa={inlineMsa}
          aligning={aligning}
          status={status}
          onBuildAlignment={() => {
            void buildAlignment(structure)
          }}
        />
      )}
    </div>
  )
}

function ResultCard({
  structure,
  collapse,
  onToggleCollapse,
  inlineMsa,
  aligning,
  status,
  onBuildAlignment,
}: {
  structure: GeneStructure
  collapse: boolean
  onToggleCollapse: (v: boolean) => void
  inlineMsa: InlineMsa | null
  aligning: boolean
  status: string
  onBuildAlignment: () => void
}) {
  const { transcript, assemblyAccession, uniprotId } = structure
  const { codingBp, ratio } = geneStats(transcript)
  const { url } = buildSessionUrl({
    structure,
    collapse,
    inlineMsa: inlineMsa ?? undefined,
  })
  const alignRows = inlineMsa
    ? (inlineMsa.fasta.match(/^>/gm) ?? []).length
    : undefined
  const chips = [
    `${transcript.cds.length} coding exons`,
    `${codingBp.toLocaleString()} bp CDS`,
    `${ratio}× collapsed`,
    alignRows ? `${alignRows}-species alignment` : undefined,
    uniprotId ? 'AlphaFold structure' : undefined,
  ].filter((c): c is string => !!c)

  return (
    <div className="msv-result">
      <h2>
        {transcript.geneName} <span className="msv-sub">{transcript.name}</span>
      </h2>
      <p className="msv-meta">
        {assemblyAccession} · {transcript.refName}{' '}
        {transcript.strand === 1 ? '+' : '−'}
      </p>
      <div className="msv-chips">
        {chips.map(c => (
          <span
            key={c}
            className="msv-chip"
          >
            {c}
          </span>
        ))}
      </div>

      <div className="msv-actions">
        <a
          className="msv-open"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in JBrowse ↗
        </a>
        <label className="msv-collapse">
          <input
            type="checkbox"
            checked={collapse}
            onChange={e => {
              onToggleCollapse(e.target.checked)
            }}
          />
          Collapse introns
        </label>
      </div>

      {inlineMsa ? (
        <p className="msv-note">
          Cross-species alignment ({alignRows} species) added — it&apos;s part
          of the session, connected to the genome and structure.
        </p>
      ) : (
        <div className="msv-advanced">
          <button
            className="msv-advanced-btn"
            disabled={aligning}
            onClick={() => {
              onBuildAlignment()
            }}
          >
            {aligning ? status || 'Aligning…' : 'Add cross-species alignment'}
          </button>
          <span className="msv-advanced-note">
            Aligns orthologs across model species (NCBI + EBI Clustal Omega,
            with CDD domains) and adds a connected alignment view — can take a
            minute.
          </span>
        </div>
      )}
    </div>
  )
}
