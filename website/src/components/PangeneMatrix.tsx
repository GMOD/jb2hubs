import useSWRImmutable from 'swr/immutable'

import { fetchJson } from '../lib/fetchJson.ts'

import type { PangeneData } from './pangenomeData.ts'
import type { PangenomeLocus } from './pangenomeLoci.ts'

const LEGEND_COPIES = [0, 1, 2, 3, 5, 8]

// Per-haplotype copy number: 0 stands out as warm red (gene absent on that
// haplotype); 1 is the single-copy baseline (lightest blue) and the ramp darkens
// with amplification.
function copyColor(n: number) {
  if (n === 0) {
    return '#e34a33'
  }
  const t = Math.min(n, 8) / 8
  return `hsl(210, 65%, ${85 - t * 52}%)`
}

function copyLabel(n: number) {
  return n === 0 ? 'absent' : n === 8 ? '8+' : String(n)
}

export default function PangeneMatrix({ locus }: { locus: PangenomeLocus }) {
  const { data, error } = useSWRImmutable<PangeneData>(
    `/pangenome/${locus.id}.pangene.json`,
    fetchJson,
  )

  return (
    <div className="pg-pangene">
      <h4 className="pg-chart-title">
        Gene copy number per haplotype
      </h4>
      <p className="pg-hint pg-pangene-caption">
        Copy number of each gene on each of the 100 haplotypes from the{' '}
        <a
          href="https://github.com/lh3/pangene"
          target="_blank"
          rel="noreferrer"
        >
          pangene
        </a>{' '}
        gene graph (human100). Each column is one assembled haplotype (PanSN
        sample#hap); GRCh38#0 and CHM13#0 are the single-haplotype references. Red
        = gene absent on that haplotype; blue darkens with copy number.
      </p>
      {error && <p className="pg-error">Could not load pangene matrix.</p>}
      {!data && !error && <p className="pg-hint">Loading matrix…</p>}
      {data && (
        <>
          <div className="pg-matrix-scroll">
            <div
              className="pg-matrix"
              style={{
                gridTemplateColumns: `110px repeat(${data.haplotypes.length}, 13px)`,
              }}
            >
              {data.genes.map((gene, gi) => (
                <div
                  key={gene}
                  className="pg-matrix-row"
                  style={{ display: 'contents' }}
                >
                  <span className="pg-matrix-gene">{gene}</span>
                  {data.matrix[gi]!.map((n, hi) => (
                    <span
                      key={data.haplotypes[hi]}
                      className="pg-matrix-cell"
                      style={{ background: copyColor(n) }}
                      title={`${data.haplotypes[hi]} · ${gene} × ${n}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="pg-matrix-legend">
            {LEGEND_COPIES.map(n => (
              <span
                key={n}
                className="pg-legend-item"
              >
                <span
                  className="pg-legend-swatch"
                  style={{ background: copyColor(n) }}
                />
                {copyLabel(n)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
