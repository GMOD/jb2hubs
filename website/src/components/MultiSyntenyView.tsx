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

function AnchorLegend({
  anchors,
  colors,
  focus,
  onFocus,
}: {
  anchors: Anchor[]
  colors: Map<string, string>
  focus: string | null
  onFocus: (anchorId: string | null) => void
}) {
  return (
    <div className="msv-legend">
      {anchors.map(a => (
        <span
          key={a.geneId}
          className="msv-legend-item"
          data-dim={focus !== null && focus !== a.geneId ? '' : undefined}
          data-focus={focus === a.geneId ? '' : undefined}
          onMouseEnter={() => {
            onFocus(a.geneId)
          }}
          onMouseLeave={() => {
            onFocus(null)
          }}
          title={`${a.symbol}${a.isQuery ? ' — the query gene' : ' — neighbor gene'} · reference ${a.refStart.toLocaleString()}–${a.refEnd.toLocaleString()} · hover to trace this gene's orthologs across species`}
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
  const [orientToRef, setOrientToRef] = useState(true)
  const layout = layoutNeighborhood(neighborhood, { mode, orientToRef })
  const H = layout.geneHeight

  // Hovering a gene or legend swatch traces one ortholog down the whole view:
  // its genes and ribbon chain stay vivid while everything else dims, so a single
  // gene is followable through the phylogeny despite the many-color palette.
  const [focusAnchor, setFocusAnchor] = useState<string | null>(null)
  const ribbonOpacity = (anchorId: string) =>
    focusAnchor === null ? 0.25 : focusAnchor === anchorId ? 0.65 : 0.04
  const geneOpacity = (anchorId: string) =>
    focusAnchor === null || focusAnchor === anchorId ? 1 : 0.18

  const queryId = neighborhood.query.geneId
  // Per-taxon species detail (full names) for row-label tooltips; the drawn row
  // label collapses to the common name, so the hover restores the rest.
  const speciesByTaxon = new Map(neighborhood.species.map(s => [s.taxonId, s]))
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
  // `inverted` comes from the row, not from the gene: the page decides a row is
  // mirrored from the SIGN OF ITS GENE-ORDER CORRELATION with the reference (see
  // isInverted in multiSyntenyLayout.ts), which is a better answer than one
  // gene's annotated strand — orthologs routinely differ in strand without the
  // locus being inverted. Passing it through is what makes the launch open the
  // same way round as the figure that was clicked.
  const openGene = (g: GeneBox, inverted: boolean) => {
    void openGeneDrilldown(
      g,
      refAssembly,
      refGenesByAnchor.get(g.anchorId),
      inverted,
    )
  }

  // Per-species locus for launching a subtree's stacked synteny view: the span of
  // the whole neighborhood the row draws (every anchor on the query gene's
  // scaffold), so each stacked genome opens showing the gene-order region the
  // ribbons describe. 5% flank keeps the edge genes off the panel border. Only
  // rows carrying the query ortholog can be placed at the query locus.
  const placementByTaxon = new Map<number, SubtreeLeaf>()
  for (const row of layout.rows) {
    if (row.hasQuery && row.assembly) {
      const flank = Math.round((row.spanEnd - row.spanStart) * 0.05)
      // Clamp the flanked start to 1 (locstrings are 1-based) so a locus near a
      // contig start doesn't produce a negative coordinate JBrowse can't parse.
      placementByTaxon.set(row.taxonId, {
        assembly: row.assembly,
        loc: `${row.refName}:${Math.max(1, row.spanStart - flank)}-${row.spanEnd + flank}`,
        flipped: row.inverted,
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
      ? {
          top: Math.min(...hoveredYs) - 4,
          bottom: Math.max(...hoveredYs) + H + 4,
        }
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
            title="Place genes at their real genomic positions and sizes (intergenic distances to scale)"
          >
            bp-scaled
          </button>
          <button
            className={mode === 'ordinal' ? 'active' : ''}
            onClick={() => {
              setMode('ordinal')
            }}
            title="Place genes in equal-width slots by order, ignoring distances — makes gene-order rearrangements easiest to read"
          >
            ordinal
          </button>
        </span>
        <label
          className="msv-orient"
          title="Mirror rows whose locus is inverted relative to the reference, so a whole-block inversion reads as a flip rather than crossing ribbons"
        >
          <input
            type="checkbox"
            checked={orientToRef}
            onChange={e => {
              setOrientToRef(e.target.checked)
            }}
          />
          orient to reference
        </label>
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
        focus={focusAnchor}
        onFocus={setFocusAnchor}
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
                fillOpacity={ribbonOpacity(r.anchorId)}
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

          {layout.rows.map(row => {
            const detail = speciesByTaxon.get(row.taxonId)
            const labelTitle = [
              detail?.scientificName ?? row.label,
              detail?.commonName && detail.commonName !== detail.scientificName
                ? `(${detail.commonName})`
                : '',
              `· NCBI taxon ${row.taxonId}`,
              row.translocated > 0
                ? `· ${row.translocated} neighbor gene${row.translocated > 1 ? 's' : ''} on a different scaffold here, not drawn in this row`
                : '',
              row.inverted
                ? '· locus inverted relative to the reference (row mirrored)'
                : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <g key={row.taxonId}>
                <text
                  x={layout.trackLeft - 6}
                  y={row.y + H / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="msv-label"
                  style={{ cursor: 'help' }}
                >
                  {row.label}
                  {row.translocated > 0 ? ` (+${row.translocated})` : ''}
                  {row.inverted ? ' ⇄' : ''}
                  <title>{labelTitle}</title>
                </text>
                <g transform={`translate(0,${row.y})`}>
                  {row.genes.map(g => (
                    <path
                      key={g.anchorId}
                      d={geneArrowPath(g, H)}
                      fill={layout.anchorColors.get(g.anchorId) ?? '#999'}
                      fillOpacity={geneOpacity(g.anchorId)}
                      stroke={g.anchorId === queryId ? '#000' : 'none'}
                      strokeWidth={g.anchorId === queryId ? 1.5 : 0}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => {
                        setFocusAnchor(g.anchorId)
                      }}
                      onMouseLeave={() => {
                        setFocusAnchor(null)
                      }}
                      onClick={() => {
                        openGene(g, row.inverted)
                      }}
                    >
                      <title>
                        {g.symbol} · {row.label} · {g.refName}:
                        {g.start.toLocaleString()}-{g.end.toLocaleString()} (
                        {g.strand > 0 ? '+' : '−'} strand) · click to open in
                        JBrowse
                      </title>
                    </path>
                  ))}
                </g>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
