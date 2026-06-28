import { useMemo, useState } from 'react'

import {
  DEFAULT_LAYOUT,
  geneArrowPath,
  layoutNeighborhood,
  ribbonPath,
  type GeneBox,
  type LayoutMode,
} from './multiSyntenyLayout.ts'
import {
  openGeneDrilldown,
  openSubtreeSynteny,
  type SubtreeLeaf,
} from './multiSyntenyDrilldown.ts'

import type { Anchor, Neighborhood } from './neighborhood.ts'

interface Props {
  neighborhood: Neighborhood
  initialMode?: LayoutMode
}

const H = DEFAULT_LAYOUT.geneHeight

function AnchorLegend({
  anchors,
  colors,
}: {
  anchors: Anchor[]
  colors: Map<string, string>
}) {
  return (
    <div className="msv-legend">
      {anchors.map(a => (
        <span
          key={a.geneId}
          className="msv-legend-item"
        >
          <span
            className="msv-swatch"
            style={{ background: colors.get(a.geneId) }}
          />
          {a.symbol}
          {a.isQuery ? ' (query)' : ''}
        </span>
      ))}
    </div>
  )
}

export default function MultiSyntenyView({
  neighborhood,
  initialMode = 'bp',
}: Props) {
  const [mode, setMode] = useState<LayoutMode>(initialMode)
  const layout = useMemo(
    () => layoutNeighborhood(neighborhood, { mode }),
    [neighborhood, mode],
  )

  const queryId = neighborhood.query.geneId
  // The reference species' own copy of the query gene — the other half of every
  // pairwise synteny drill-down.
  const refAssembly = useMemo(
    () =>
      neighborhood.species
        .find(s => s.taxonId === neighborhood.query.refTaxonId)
        ?.genes.find(g => g.anchorId === queryId)?.assembly,
    [neighborhood, queryId],
  )
  const openGene = (g: GeneBox) => {
    void openGeneDrilldown(g, refAssembly)
  }

  // Per-species query-gene locus, for launching a subtree's stacked synteny view.
  const placementByTaxon = useMemo(() => {
    const m = new Map<number, SubtreeLeaf>()
    for (const s of neighborhood.species) {
      const q = s.genes.find(g => g.anchorId === queryId)
      if (q) {
        m.set(s.taxonId, {
          assembly: q.assembly,
          loc: `${q.refName}:${q.start}-${q.end}`,
        })
      }
    }
    return m
  }, [neighborhood, queryId])

  const openSubtree = (leafTaxonIds: number[]) => {
    void openSubtreeSynteny(
      leafTaxonIds
        .map(t => placementByTaxon.get(t))
        .filter((p): p is SubtreeLeaf => !!p),
    )
  }

  // Hovering a branch point highlights the contiguous band of rows it covers, so
  // the clade a click would launch is visible before clicking.
  const [hovered, setHovered] = useState<Set<number> | null>(null)
  const band = useMemo(() => {
    const ys = hovered
      ? layout.rows.filter(r => hovered.has(r.taxonId)).map(r => r.y)
      : []
    return ys.length >= 2
      ? { top: Math.min(...ys) - 4, bottom: Math.max(...ys) + H + 4 }
      : null
  }, [hovered, layout])

  return (
    <div className="msv">
      <div className="msv-controls">
        <strong>{neighborhood.query.symbol}</strong> neighborhood ·{' '}
        {layout.rows.length} species · {neighborhood.anchors.length} genes
        <span className="msv-modes">
          <button
            className={mode === 'bp' ? 'active' : ''}
            onClick={() => {
              setMode('bp')
            }}
          >
            bp-scaled
          </button>
          <button
            className={mode === 'ordinal' ? 'active' : ''}
            onClick={() => {
              setMode('ordinal')
            }}
          >
            ordinal
          </button>
        </span>
      </div>

      <AnchorLegend
        anchors={neighborhood.anchors}
        colors={layout.anchorColors}
      />

      <div className="msv-scroll">
        <svg
          width={layout.width}
          height={layout.height}
          role="img"
        >
          {band && (
            <rect
              x={0}
              y={band.top}
              width={layout.width}
              height={band.bottom - band.top}
              className="msv-band"
            />
          )}

          <g className="msv-ribbons">
            {layout.ribbons.map((r, i) => (
              <path
                key={i}
                d={ribbonPath(r)}
                fill={r.color}
                fillOpacity={0.25}
              />
            ))}
          </g>

          <g
            className="msv-tree"
            stroke="#aaa"
            strokeWidth={1}
            fill="none"
          >
            {layout.treeEdges.map((e, i) => (
              <line
                key={i}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
              />
            ))}
          </g>

          <g className="msv-treenodes">
            {layout.treeNodes.map((n, i) => {
              const count = n.leafTaxonIds.filter(t =>
                placementByTaxon.has(t),
              ).length
              return count >= 2 ? (
                <g
                  key={i}
                  onMouseEnter={() => {
                    setHovered(new Set(n.leafTaxonIds))
                  }}
                  onMouseLeave={() => {
                    setHovered(null)
                  }}
                  onClick={() => {
                    openSubtree(n.leafTaxonIds)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {/* generous transparent hit target around the small dot */}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={9}
                    style={{ fill: 'transparent' }}
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={3.5}
                    className="msv-node-dot"
                  />
                  <title>Launch stacked synteny view of {count} species</title>
                </g>
              ) : null
            })}
          </g>

          {layout.rows.map(row => (
            <g key={row.taxonId}>
              <text
                x={layout.trackLeft - 6}
                y={row.y + H / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="msv-label"
              >
                {row.label}
                {row.translocated > 0 ? ` (+${row.translocated})` : ''}
              </text>
              <g transform={`translate(0,${row.y})`}>
                {row.genes.map(g => (
                  <path
                    key={g.anchorId}
                    d={geneArrowPath(g, H)}
                    fill={layout.anchorColors.get(g.anchorId) ?? '#999'}
                    stroke={g.anchorId === queryId ? '#000' : 'none'}
                    strokeWidth={g.anchorId === queryId ? 1.5 : 0}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      openGene(g)
                    }}
                  >
                    <title>
                      {g.symbol} · {row.label} · {g.refName}:{g.start}-{g.end} (
                      {g.strand > 0 ? '+' : '−'})
                    </title>
                  </path>
                ))}
              </g>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
