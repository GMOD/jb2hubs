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

// Column order for the heatmap. References (identified by the generator, not
// guessed here) are pinned to the front in their given order; the remaining
// assembly haplotypes are sorted by their copy-number vector, so haplotypes with
// the same gene-content pattern sit together instead of scattering across ~100
// look-alike columns. This is a pure display reordering — it asserts nothing
// beyond "group like patterns" and works for any graph's matrix.
function columnOrder(data: PangeneData) {
  const refNames = data.referenceHaplotypes ?? []
  const refSet = new Set(refNames)
  const index = new Map(data.haplotypes.map((hap, hi) => [hap, hi]))
  const refCols = refNames
    .filter(r => index.has(r))
    .map(hap => ({ hap, hi: index.get(hap)! }))
  const byPattern = (a: number, b: number) => {
    for (const row of data.matrix) {
      const d = row[b]! - row[a]!
      if (d !== 0) {
        return d
      }
    }
    return 0
  }
  const assemblyCols = data.haplotypes
    .map((hap, hi) => ({ hap, hi }))
    .filter(c => !refSet.has(c.hap))
    .sort((a, b) => byPattern(a.hi, b.hi))
  return { order: [...refCols, ...assemblyCols], refCount: refCols.length }
}

function copyRange(row: number[]) {
  const min = Math.min(...row)
  const max = Math.max(...row)
  return min === max ? String(min) : `${min}–${max}`
}

export default function PangeneMatrix({ locus }: { locus: PangenomeLocus }) {
  const { data, error } = useSWRImmutable<PangeneData>(
    `/pangenome/${locus.id}.pangene.json`,
    fetchJson,
  )
  const { order, refCount } = data
    ? columnOrder(data)
    : { order: [], refCount: 0 }

  return (
    <div className="pg-pangene">
      <h4 className="pg-chart-title">Gene copy number per haplotype</h4>
      <p className="pg-hint pg-pangene-caption">
        From the{' '}
        <a
          href="https://github.com/lh3/pangene"
          target="_blank"
          rel="noreferrer"
        >
          pangene
        </a>{' '}
        human100 gene graph (a separate cohort from the variant charts). One
        column per haplotype; {refCount > 0 ? 'references first, then ' : ''}
        assemblies ordered by copy-number pattern so like patterns group. The
        range column is min–max copies across haplotypes; red (hatched) = gene
        absent (copy 0), blue darkens with copy number.
      </p>
      {error && <p className="pg-error">Could not load pangene matrix.</p>}
      {!data && !error && <p className="pg-hint">Loading matrix…</p>}
      {data && (
        <>
          <div className="pg-matrix-scroll">
            <div
              className="pg-matrix"
              style={{
                gridTemplateColumns: `110px 44px repeat(${order.length}, 13px)`,
              }}
            >
              {data.genes.map((gene, gi) => {
                const row = data.matrix[gi]!
                return (
                  <div
                    key={gene}
                    className="pg-matrix-row"
                    style={{ display: 'contents' }}
                  >
                    <span className="pg-matrix-gene">{gene}</span>
                    <span className="pg-matrix-range">{copyRange(row)}</span>
                    {order.map((o, pos) => {
                      const n = row[o.hi]!
                      return (
                        <span
                          key={o.hap}
                          className={`pg-matrix-cell${n === 0 ? ' pg-matrix-cell-absent' : ''}${pos === refCount - 1 ? ' pg-matrix-cell-refdiv' : ''}`}
                          style={{ backgroundColor: copyColor(n) }}
                          title={`${o.hap} · ${gene} × ${n}`}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="pg-matrix-legend">
            <span className="pg-legend-item pg-legend-count">
              {order.length} haplotypes
              {refCount > 0 ? ` · first ${refCount} are references` : ''}
            </span>
            {LEGEND_COPIES.map(n => (
              <span
                key={n}
                className="pg-legend-item"
              >
                <span
                  className={`pg-legend-swatch${n === 0 ? ' pg-matrix-cell-absent' : ''}`}
                  style={{ backgroundColor: copyColor(n) }}
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
