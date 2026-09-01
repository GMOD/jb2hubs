import { useMemo, useState } from 'react'

import { useResetOnChange } from '../hooks/useResetOnChange.ts'
import {
  DEFAULT_SUBTREE_GENOMES,
  type DrilldownData,
  REF_ALIGNMENTS,
  type SubtreeLeaf,
  geneDrilldownUrl,
  nearestWindow,
  openGeneDrilldown,
  openRefAlignment,
  openSubtreeSynteny,
  subtreeSyntenyUrl,
} from './multiSyntenyDrilldown.ts'
import {
  type GeneBox,
  type LayoutMode,
  geneArrowPath,
  layoutNeighborhood,
  ribbonPath,
} from './multiSyntenyLayout.ts'

import type { Anchor, Neighborhood } from './neighborhood.ts'
import type { MouseEvent, ReactNode } from 'react'

interface Props {
  neighborhood: Neighborhood
  // Undefined until the pair catalog and assembly index have been prefetched;
  // genes and branch points are plain click targets until then and real links
  // after.
  drilldown: DrilldownData | undefined
}

// Hovering a gene, ribbon or legend swatch traces one ortholog down the whole
// view: its genes and ribbon chain stay vivid while everything else dims.
// Hovering a branch point shows the band of rows it covers. Both are CSS: the
// wrapper carries `data-focus` / `data-clade`, set straight on the DOM from one
// delegated handler, and the rules below light the matching elements — no
// React state, so a hover over one of ~900 paths re-renders nothing.
function setOrClear(el: Element, name: string, value: string | undefined) {
  if (value === undefined) {
    el.removeAttribute(name)
  } else {
    el.setAttribute(name, value)
  }
}

function traceHover(e: MouseEvent<HTMLDivElement>) {
  const target = e.target instanceof Element ? e.target : undefined
  setOrClear(
    e.currentTarget,
    'data-focus',
    target?.closest('[data-anchor]')?.getAttribute('data-anchor') ?? undefined,
  )
  setOrClear(
    e.currentTarget,
    'data-clade',
    target?.closest('[data-clade]')?.getAttribute('data-clade') ?? undefined,
  )
}

function clearHover(e: MouseEvent<HTMLDivElement>) {
  e.currentTarget.removeAttribute('data-focus')
  e.currentTarget.removeAttribute('data-clade')
}

// One rule per anchor and per branch point; the static half (what dims, what a
// lit element looks like) is in conserved-gene-order.astro. Rendered only on the
// client, so the selector quotes reach the sheet verbatim.
function hoverRules(anchors: Anchor[], cladeCount: number) {
  const focus = anchors.map(
    a =>
      `.msv[data-focus="${a.geneId}"] [data-anchor="${a.geneId}"]{--msv-on:1}`,
  )
  const clades = Array.from(
    { length: cladeCount },
    (_, i) =>
      `.msv[data-clade="${i}"] .msv-band[data-node="${i}"]{visibility:visible}`,
  )
  return [...focus, ...clades].join('\n')
}

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
          data-anchor={a.geneId}
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

// A link when the url is known, else the element itself with its click fallback.
function Launch({
  href,
  title,
  children,
}: {
  href: string | undefined
  title: string
  children: ReactNode
}) {
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={title}
    >
      {children}
    </a>
  ) : (
    children
  )
}

interface Clade {
  leaves: SubtreeLeaf[]
  opened: number
}

export default function MultiSyntenyView({ neighborhood, drilldown }: Props) {
  const [mode, setMode] = useState<LayoutMode>('bp')
  const [orientToRef, setOrientToRef] = useState(true)
  const layout = useMemo(
    () => layoutNeighborhood(neighborhood, { mode, orientToRef }),
    [neighborhood, mode, orientToRef],
  )
  const H = layout.geneHeight

  const queryId = neighborhood.query.geneId
  const refTaxonId = neighborhood.query.refTaxonId
  // Per-taxon species detail (full names) for row-label tooltips; the drawn row
  // label collapses to the common name, so the hover restores the rest.
  const speciesByTaxon = new Map(neighborhood.species.map(s => [s.taxonId, s]))
  // The reference species' genes, keyed by anchor — each anchor's reference
  // locus drives the reference panel of a pairwise synteny drill-down, and the
  // query anchor's gene is the locus for the whole-genome alignment view.
  const refSpecies = neighborhood.species.find(s => s.taxonId === refTaxonId)
  const refGenesByAnchor = new Map(
    refSpecies?.genes.map(g => [g.anchorId, g]) ?? [],
  )
  const refGene = refGenesByAnchor.get(queryId)
  const refAssembly = refGene?.assembly
  const refAlignment = REF_ALIGNMENTS[refTaxonId]
  // `inverted` comes from the row, not from the gene: the page decides a row is
  // mirrored from the SIGN OF ITS GENE-ORDER CORRELATION with the reference (see
  // isInverted in multiSyntenyLayout.ts), which is a better answer than one
  // gene's annotated strand — orthologs routinely differ in strand without the
  // locus being inverted. Passing it through is what makes the launch open the
  // same way round as the figure that was clicked.
  const geneHref = (g: GeneBox, inverted: boolean) =>
    drilldown
      ? geneDrilldownUrl(
          g,
          refAssembly,
          refGenesByAnchor.get(g.anchorId),
          drilldown.index,
          drilldown.hosted(g.assembly),
          inverted,
        )
      : undefined
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
  const leavesOf = (taxonIds: number[]) =>
    taxonIds
      .map(t => placementByTaxon.get(t))
      .filter((p): p is SubtreeLeaf => !!p)
  const subtreeHref = (leaves: SubtreeLeaf[]) =>
    drilldown ? subtreeSyntenyUrl(leaves, drilldown.index) : undefined

  // Branch points that can launch, each with the band of rows it covers (drawn
  // hidden, lit by the hover rules) and the leaves nearest the reference that a
  // click opens. The rest of a big clade is a second, explicit choice.
  const clades = layout.treeNodes
    .map(n => {
      const placed = n.leafTaxonIds.filter(t => placementByTaxon.has(t))
      const ys = layout.rows
        .filter(r => placed.includes(r.taxonId))
        .map(r => r.y)
      return {
        x: n.x,
        y: n.y,
        placed,
        nearest: nearestWindow(
          placed,
          placed.indexOf(refTaxonId),
          DEFAULT_SUBTREE_GENOMES,
        ),
        top: Math.min(...ys) - 4,
        bottom: Math.max(...ys) + H + 4,
      }
    })
    .filter(c => c.placed.length >= 2)

  // The clade whose branch point was last clicked, so a launch that opened the
  // nearest few can be followed by one that opens them all.
  const [clade, setClade] = useResetOnChange<Clade | null>(
    `${queryId}:${refTaxonId}:${neighborhood.anchors.length}:${neighborhood.species.length}:${orientToRef}`,
    null,
  )
  const allHref = clade && subtreeHref(clade.leaves)

  return (
    <div
      className="msv"
      onMouseOver={e => {
        traceHover(e)
      }}
      onMouseLeave={e => {
        clearHover(e)
      }}
    >
      <style>{hoverRules(neighborhood.anchors, clades.length)}</style>
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
              openRefAlignment(refTaxonId, refGene)
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

      {clade && clade.leaves.length > clade.opened && (
        <p className="ui-hint">
          Opened the {clade.opened} species nearest the reference of the{' '}
          {clade.leaves.length} in that clade.{' '}
          {allHref ? (
            <a
              href={allHref}
              target="_blank"
              rel="noopener"
            >
              Open all {clade.leaves.length} →
            </a>
          ) : (
            <button
              className="ui-linkbtn"
              onClick={() => {
                void openSubtreeSynteny(clade.leaves)
              }}
            >
              Open all {clade.leaves.length} →
            </button>
          )}
        </p>
      )}

      <div className="msv-scroll">
        <svg
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label={`${neighborhood.query.symbol} and its neighbors across ${layout.rows.length} species, in taxonomy order`}
        >
          <g className="msv-bands">
            {clades.map((c, i) => (
              <rect
                key={i}
                data-node={i}
                x={0}
                y={c.top}
                width={layout.width}
                height={c.bottom - c.top}
                className="msv-band"
              />
            ))}
          </g>

          <g className="msv-ribbons">
            {layout.ribbons.map((r, i) => (
              <path
                key={i}
                data-anchor={r.anchorId}
                d={ribbonPath(r)}
                fill={r.color}
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
            {clades.map((c, i) => {
              const leaves = leavesOf(c.nearest)
              const title =
                c.placed.length > c.nearest.length
                  ? `Open a stacked synteny view of the ${c.nearest.length} species nearest the reference, of ${c.placed.length} in this clade`
                  : `Open a stacked synteny view of these ${c.placed.length} species`
              const remember = () => {
                setClade({ leaves: leavesOf(c.placed), opened: leaves.length })
              }
              const href = subtreeHref(leaves)
              return (
                <Launch
                  key={i}
                  href={href}
                  title={title}
                >
                  <g
                    data-clade={i}
                    onClick={() => {
                      remember()
                      if (!href) {
                        void openSubtreeSynteny(leaves)
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* generous transparent hit target around the small dot */}
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={9}
                      style={{ fill: 'transparent' }}
                    />
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={3.5}
                      className="msv-node-dot"
                    />
                    <title>{title}</title>
                  </g>
                </Launch>
              )
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
                <g
                  className="msv-genes"
                  transform={`translate(0,${row.y})`}
                >
                  {row.genes.map(g => {
                    const href = geneHref(g, row.inverted)
                    // Before the prefetch lands every gene is assumed openable,
                    // as the click path always did; after it, the index has
                    // the last word.
                    const openable = drilldown ? href !== undefined : true
                    const title = `${g.symbol} · ${row.label} · ${g.refName}:${g.start.toLocaleString()}-${g.end.toLocaleString()} (${g.strand > 0 ? '+' : '−'} strand)${openable ? ' · open in JBrowse' : ' · not a genome we host'}`
                    return (
                      <Launch
                        key={g.anchorId}
                        href={href}
                        title={title}
                      >
                        <path
                          data-anchor={g.anchorId}
                          d={geneArrowPath(g, H)}
                          fill={layout.anchorColors.get(g.anchorId) ?? '#999'}
                          stroke={g.anchorId === queryId ? '#000' : 'none'}
                          strokeWidth={g.anchorId === queryId ? 1.5 : 0}
                          style={{ cursor: openable ? 'pointer' : 'default' }}
                          onClick={
                            href !== undefined || !openable
                              ? undefined
                              : () => {
                                  openGene(g, row.inverted)
                                }
                          }
                        >
                          <title>{title}</title>
                        </path>
                      </Launch>
                    )
                  })}
                </g>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
