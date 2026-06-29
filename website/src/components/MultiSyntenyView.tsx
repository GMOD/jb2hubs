import { useState } from 'react'

import {
  MAX_SUBTREE_GENOMES,
  REF_ALIGNMENTS,
  type SubtreeLeaf,
  openGeneDrilldown,
  openRefAlignment,
  openSubtreeSynteny,
} from './multiSyntenyDrilldown.ts'
import {
  DEFAULT_LAYOUT,
  type GeneBox,
  type LayoutMode,
  geneArrowPath,
  layoutNeighborhood,
  ribbonPath,
} from './multiSyntenyLayout.ts'

import type { Anchor, Neighborhood } from './neighborhood.ts'

interface Props {
  neighborhood: Neighborhood
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

export default function MultiSyntenyView({ neighborhood }: Props) {
  const [mode, setMode] = useState<LayoutMode>('bp')
  const layout = layoutNeighborhood(neighborhood, { mode })

  const queryId = neighborhood.query.geneId
  // The reference species' genes, keyed by anchor — each anchor's reference
  // locus drives the reference panel of a pairwise synteny drill-down, and the
  // query anchor's gene is the locus for the whole-genome alignment view.
  const refSpecies = neighborhood.species.find(
    s => s.taxonId === neighborhood.query.refTaxonId,
  )
  const refGenesByAnchor = new Map(
    refSpecies?.genes.map(g => [g.anchorId, g]) ?? [],
  )
  const refGene = refGenesByAnchor.get(queryId)
  const refAssembly = refGene?.assembly
  const refAlignment = REF_ALIGNMENTS[neighborhood.query.refTaxonId]
  const openGene = (g: GeneBox) => {
    const r = refGenesByAnchor.get(g.anchorId)
    const refLoc = r ? `${r.refName}:${r.start}-${r.end}` : undefined
    void openGeneDrilldown(g, refAssembly, refLoc)
  }

  // Per-species locus for launching a subtree's stacked synteny view: the span of
  // the whole neighborhood (every anchor on the query gene's scaffold), not just
  // the query gene, so each stacked genome opens showing the gene-order region the
  // ribbons describe. 5% flank keeps the edge genes off the panel border.
  const placementByTaxon = new Map<number, SubtreeLeaf>()
  for (const s of neighborhood.species) {
    const q = s.genes.find(g => g.anchorId === queryId)
    if (q) {
      const onScaffold = s.genes.filter(g => g.refName === q.refName)
      const min = Math.min(...onScaffold.map(g => g.start))
      const max = Math.max(...onScaffold.map(g => g.end))
      const flank = Math.round((max - min) * 0.05)
      placementByTaxon.set(s.taxonId, {
        assembly: q.assembly,
        loc: `${q.refName}:${min - flank}-${max + flank}`,
      })
    }
  }

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
  const hoveredYs = hovered
    ? layout.rows.filter(r => hovered.has(r.taxonId)).map(r => r.y)
    : []
  const band =
    hoveredYs.length >= 2
      ? { top: Math.min(...hoveredYs) - 4, bottom: Math.max(...hoveredYs) + H + 4 }
      : null

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
        {refAlignment && refGene && (
          <button
            className="msv-align-btn"
            onClick={() => {
              openRefAlignment(neighborhood.query.refTaxonId, refGene)
            }}
            title={`Open the ${refAlignment.alignmentLabel} at ${neighborhood.query.symbol} in JBrowse`}
          >
            ▤ {refAlignment.alignmentLabel}
          </button>
        )}
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
                  <title>
                    Launch stacked synteny view of{' '}
                    {count > MAX_SUBTREE_GENOMES
                      ? `the ${MAX_SUBTREE_GENOMES} nearest of ${count}`
                      : count}{' '}
                    species
                  </title>
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
