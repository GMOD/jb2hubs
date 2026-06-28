import { useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import {
  DIVERGENCE_LABELS,
  PANGENOME_LOCI,
  locusRegion,
} from './pangenomeLoci.ts'
import { hprcSyntenyUrl, hprcVcfLgvUrl } from './pangenomeLinks.ts'
import MsaPanel from './MsaPanel.tsx'

import type { DivergenceKind, PangenomeLocus } from './pangenomeLoci.ts'

interface Bin {
  label: string
  count: number
}

interface LocusSummary {
  id: string
  gene: string
  region: string
  ref: string
  source: string
  variantCount: number
  typeCounts: Record<string, number>
  afHistogram: Bin[]
  sizeHistogram: Bin[]
  sampleBurden: { sample: string; count: number }[]
}

interface PangeneData {
  id: string
  source: string
  samples: string[]
  genes: string[]
  matrix: number[][]
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// 0 copies stands out as warm red (gene absent); 1+ is a blue ramp that darkens
// with copy number, anchored so diploid (2) reads as a calm mid-blue.
function copyColor(n: number) {
  if (n === 0) {
    return '#e34a33'
  }
  const t = Math.min(n, 8) / 8
  return `hsl(210, 65%, ${85 - t * 52}%)`
}

function KindBadges({ kinds }: { kinds: DivergenceKind[] }) {
  return (
    <span>
      {kinds.map(k => (
        <span
          key={k}
          className={`pg-badge pg-badge-${k}`}
        >
          {DIVERGENCE_LABELS[k]}
        </span>
      ))}
    </span>
  )
}

function BarChart({
  title,
  bins,
}: {
  title: string
  bins: { label: string; count: number }[]
}) {
  const max = Math.max(1, ...bins.map(b => b.count))
  return (
    <div className="pg-chart">
      <h4 className="pg-chart-title">{title}</h4>
      {bins.map(b => (
        <div
          key={b.label}
          className="pg-bar-row"
        >
          <span className="pg-bar-label">{b.label}</span>
          <span className="pg-bar-track">
            <span
              className="pg-bar-fill"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </span>
          <span className="pg-bar-count">{b.count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function PangeneMatrix({ locus }: { locus: PangenomeLocus }) {
  const { data, error } = useSWRImmutable<PangeneData>(
    `/pangenome/${locus.id}.pangene.json`,
    fetchJson,
  )

  return (
    <div className="pg-pangene">
      <h4 className="pg-chart-title">
        Gene presence / absence &amp; copy number across haplotypes
      </h4>
      <p className="pg-hint pg-pangene-caption">
        Per-sample copy number from the{' '}
        <a
          href="https://github.com/lh3/pangene"
          target="_blank"
          rel="noreferrer"
        >
          pangene
        </a>{' '}
        gene graph (human100). Red = gene absent; blue darkens with copy number.
        GRCh38 and CHM13 are haploid references (max 1 copy).
      </p>
      {error && <p className="pg-error">Could not load pangene matrix.</p>}
      {!data && !error && <p className="pg-hint">Loading matrix…</p>}
      {data && (
        <>
          <div className="pg-matrix-scroll">
            <div
              className="pg-matrix"
              style={{
                gridTemplateColumns: `110px repeat(${data.samples.length}, 13px)`,
              }}
            >
              {data.genes.map((gene, gi) => (
                <div
                  key={gene}
                  className="pg-matrix-row"
                  style={{ display: 'contents' }}
                >
                  <span className="pg-matrix-gene">{gene}</span>
                  {data.matrix[gi]!.map((n, si) => (
                    <span
                      key={data.samples[si]}
                      className="pg-matrix-cell"
                      style={{ background: copyColor(n) }}
                      title={`${data.samples[si]} · ${gene} × ${n}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="pg-matrix-legend">
            {[0, 1, 2, 3, 5, 8].map(n => (
              <span
                key={n}
                className="pg-legend-item"
              >
                <span
                  className="pg-legend-swatch"
                  style={{ background: copyColor(n) }}
                />
                {n === 0 ? 'absent' : n === 8 ? '8+' : n}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function typeBins(typeCounts: Record<string, number>) {
  return Object.entries(typeCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

function LocusDashboard({ locus }: { locus: PangenomeLocus }) {
  const { data: summary, error } = useSWRImmutable<LocusSummary>(
    `/pangenome/${locus.id}.vcfsummary.json`,
    fetchJson,
  )

  return (
    <div className="pg-dashboard">
      <div className="pg-dash-header">
        <div>
          <h2 className="pg-dash-title">
            {locus.gene}{' '}
            <span className="pg-dash-fullname">{locus.fullName}</span>
          </h2>
          <KindBadges kinds={locus.kinds} />
          <p className="pg-dash-loc">
            GRCh38 {locusRegion(locus)}
            {summary && (
              <>
                {' · '}
                {summary.variantCount.toLocaleString()} pangenome variants ·{' '}
                {summary.sampleBurden.length} samples
              </>
            )}
          </p>
          <p className="pg-dash-story">{locus.story}</p>
        </div>
      </div>

      <div className="pg-launch-bar">
        <a
          className="pg-launch-btn"
          href={hprcVcfLgvUrl(locus)}
          target="_blank"
          rel="noreferrer"
        >
          Browse HPRC variants in JBrowse →
        </a>
        <a
          className="pg-launch-btn pg-launch-secondary"
          href={hprcSyntenyUrl(locus)}
          target="_blank"
          rel="noreferrer"
        >
          Compare GRCh38 ↔ CHM13 (synteny) →
        </a>
      </div>

      {error && (
        <p className="pg-error">
          Could not load precomputed summary for this locus.
        </p>
      )}
      {!summary && !error && <p className="pg-hint">Loading summary…</p>}

      {summary && (
        <>
          <div className="pg-charts">
            <BarChart
              title="Variant types"
              bins={typeBins(summary.typeCounts)}
            />
            <BarChart
              title="Allele-frequency distribution"
              bins={summary.afHistogram}
            />
            <BarChart
              title="Variant size"
              bins={summary.sizeHistogram}
            />
          </div>

          <div className="pg-burden">
            <h4 className="pg-chart-title">
              Variant burden per sample (in this region)
            </h4>
            <BarChart
              title=""
              bins={summary.sampleBurden.map(s => ({
                label: s.sample,
                count: s.count,
              }))}
            />
          </div>
        </>
      )}

      {locus.pangeneGenes?.length ? <PangeneMatrix locus={locus} /> : null}

      <div className="pg-msa">
        <h4 className="pg-chart-title">Multi-haplotype alignment</h4>
        <p className="pg-hint pg-pangene-caption">
          HPRC haplotypes aligned to GRCh38 across this window, in an embedded{' '}
          <a
            href="https://github.com/GMOD/react-msaview"
            target="_blank"
            rel="noreferrer"
          >
            react-msaview
          </a>{' '}
          panel; gene exons are overlaid on the reference row.
        </p>
        <MsaPanel
          key={locus.id}
          msaUrl={`/pangenome/msa/${locus.id}.fa`}
          gffUrl={`/pangenome/msa/${locus.id}.exons.gff`}
          height={420}
        />
      </div>
    </div>
  )
}

const KIND_FILTERS: { key: DivergenceKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'structural', label: DIVERGENCE_LABELS.structural },
  { key: 'presence-absence', label: DIVERGENCE_LABELS['presence-absence'] },
  { key: 'hypervariable', label: DIVERGENCE_LABELS.hypervariable },
]

export default function PangenomeExplorer() {
  const [selectedId, setSelectedId] = useState(PANGENOME_LOCI[0]?.id ?? '')
  const [filter, setFilter] = useState<DivergenceKind | 'all'>('all')

  const visible = PANGENOME_LOCI.filter(
    l => filter === 'all' || l.kinds.includes(filter),
  )
  const selected =
    PANGENOME_LOCI.find(l => l.id === selectedId) ?? PANGENOME_LOCI[0]

  return (
    <div>
      <div className="pg-filters">
        {KIND_FILTERS.map(f => (
          <button
            key={f.key}
            className={`pg-filter${filter === f.key ? ' pg-filter-active' : ''}`}
            onClick={() => {
              setFilter(f.key)
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="pg-grid">
        {visible.map(l => (
          <button
            key={l.id}
            className={`pg-card${l.id === selectedId ? ' pg-card-active' : ''}`}
            onClick={() => {
              setSelectedId(l.id)
            }}
          >
            <span className="pg-card-gene">{l.gene}</span>
            <span className="pg-card-fullname">{l.fullName}</span>
            <KindBadges kinds={l.kinds} />
          </button>
        ))}
      </div>

      {selected && <LocusDashboard locus={selected} />}
    </div>
  )
}
