import '../styles/geneOrder.css'

import { useMemo } from 'react'

import { LaunchLink } from './DesktopLaunch.tsx'
import { neighborhoodStar } from './geneOrderStar.ts'
import {
  type DrilldownData,
  geneDrilldownUrl,
} from './multiSyntenyDrilldown.ts'
import {
  type GeneBox,
  type LayoutMode,
  formatSpan,
  geneArrowPath,
  mayAdjoin,
  layoutNeighborhood,
  referenceOrder,
  ribbonPath,
  scaffoldPlacement,
} from './multiSyntenyLayout.ts'
import { locusText } from './orthologResults.ts'

import type {
  Anchor,
  Neighborhood,
  PlacedGene,
  SpeciesRow,
} from './neighborhood.ts'
import type { ReactNode, SyntheticEvent } from 'react'

interface Props {
  neighborhood: Neighborhood
  // Every species the neighborhood holds, before the figure's trim, for the
  // star's NCBI ortholog lanes
  allSpecies: SpeciesRow[]
  // Undefined until the pair catalog and assembly index have loaded; genes
  // become links then. A click that only follows an href is not
  // a popup for the blocker to eat.
  drilldown: DrilldownData | undefined
  mode: LayoutMode
  // Links set on the line under the figure, after the JBrowse launch
  children?: ReactNode
}

// Hovering a gene, ribbon or legend swatch traces one ortholog down the whole
// view: its genes and ribbon chain stay vivid while everything else dims. The
// wrapper carries `data-focus`, set straight on the DOM from one delegated
// handler, and the rules below light the matching elements — no React state, so
// a hover over one of ~900 paths re-renders nothing. Keyboard focus lands on a
// gene's link, which holds the anchored path rather than carrying it; a hover
// looks only upward, or blank space inside the figure would light its first
// ribbon.
function traceHover(e: SyntheticEvent<HTMLDivElement>) {
  const target = e.target instanceof Element ? e.target : undefined
  const anchored =
    target?.closest('[data-anchor]') ??
    (e.type === 'focus' ? target?.querySelector('[data-anchor]') : undefined)
  const focus = anchored?.getAttribute('data-anchor')
  if (focus) {
    e.currentTarget.setAttribute('data-focus', focus)
  } else {
    e.currentTarget.removeAttribute('data-focus')
  }
}

function clearHover(e: SyntheticEvent<HTMLDivElement>) {
  e.currentTarget.removeAttribute('data-focus')
}

// One rule per anchor; the static half (what dims, what a lit element looks
// like) is in styles/geneOrder.css. Rendered only on the client, so the
// selector quotes reach the sheet verbatim.
function hoverRules(anchors: Anchor[]) {
  return anchors
    .map(
      a =>
        `.msv[data-focus="${a.geneId}"] [data-anchor="${a.geneId}"]{--msv-on:1}`,
    )
    .join('\n')
}

// A column header is set at -40°: each character of a symbol rises and runs
// about this far
const HEADER_RISE = 4.4
const HEADER_RUN = 5.2

// What a dashed box stands for: its gene is in this genome but not in the run
// the row draws
function elsewhereText(
  g: GeneBox,
  drawn: GeneBox | undefined,
  start: number,
  end: number,
) {
  return g.refName === drawn?.refName
    ? `${formatSpan(Math.min(Math.abs(g.start - end), Math.abs(start - g.end)))} along this sequence, too far to draw as a neighbor`
    : drawn && mayAdjoin(g, drawn)
      ? scaffoldPlacement(g).loose
        ? `on ${g.refName}, ${looseText(g)}, so it may lie beside these genes`
        : `on ${g.chromosome} (${g.refName}); this row is ${looseText(drawn)}, so the two may be neighbors`
      : `on ${g.chromosome} (${g.refName}), not this row's sequence`
}

function looseText(g: GeneBox) {
  const { chromosome } = scaffoldPlacement(g)
  return chromosome
    ? `a scaffold this assembly has not placed within chromosome ${chromosome}`
    : 'a scaffold this assembly has not placed on a chromosome'
}

// A label wider than this runs into the tree's tips; the full name is in the
// label's tooltip.
const MAX_LABEL_CHARS = 26

function fitLabel(label: string) {
  return label.length > MAX_LABEL_CHARS
    ? `${label.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…`
    : label
}

// The legend for the to-scale layout, where genes have no columns: each anchor
// in the reference row's order, with the extent that row draws (NCBI's own
// span of human OR51B5 runs 165 kb for a 939 bp glyph). Evenly spaced, each
// gene sits in its reference gene's column under that gene's name; headers
// were dropped on 2026-10-15 while rows packed from the left and put gelada's
// HBG2 under human's HBD.
function AnchorLegend({
  anchors,
  refGenes,
  colors,
}: {
  anchors: Anchor[]
  refGenes: Map<string, PlacedGene>
  colors: Map<string, string>
}) {
  return (
    <div className="msv-legend">
      {anchors.map(a => (
        <span
          key={a.geneId}
          className="msv-legend-item"
          data-anchor={a.geneId}
          title={`${a.symbol}${a.isQuery ? ' — the query gene' : ' — neighbor gene'} · reference ${(refGenes.get(a.geneId)?.start ?? a.refStart).toLocaleString()}–${(refGenes.get(a.geneId)?.end ?? a.refEnd).toLocaleString()} · hover to trace this gene's orthologs across species`}
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

// A link when the url is known, else the element itself, inert.
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
    <LaunchLink
      href={href}
      ariaLabel={title}
    >
      {children}
    </LaunchLink>
  ) : (
    children
  )
}

export default function MultiSyntenyView({
  neighborhood,
  allSpecies,
  drilldown,
  mode,
  children,
}: Props) {
  const longest = Math.max(0, ...neighborhood.anchors.map(a => a.symbol.length))
  const layout = useMemo(
    () =>
      layoutNeighborhood(
        neighborhood,
        mode === 'ordinal'
          ? {
              mode,
              headerHeight: Math.max(40, 16 + longest * HEADER_RISE),
              spanWidth: Math.ceil(longest * HEADER_RUN),
            }
          : { mode },
      ),
    [neighborhood, mode, longest],
  )
  const H = layout.geneHeight

  const queryId = neighborhood.query.geneId
  const refTaxonId = neighborhood.query.refTaxonId
  // Per-taxon species detail (full names) for row-label tooltips; the drawn row
  // label collapses to the common name, so the hover restores the rest.
  const speciesByTaxon = new Map(neighborhood.species.map(s => [s.taxonId, s]))
  // The reference species' genes, keyed by anchor — each anchor's reference
  // locus drives the reference panel of a pairwise synteny drill-down.
  const refSpecies = neighborhood.species.find(s => s.taxonId === refTaxonId)
  const refGenesByAnchor = new Map(
    refSpecies?.genes.map(g => [g.anchorId, g]) ?? [],
  )
  const refGene = refGenesByAnchor.get(queryId)
  const refAssembly = refGene?.assembly
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
          drilldown,
          inverted,
        )
      : undefined

  const star =
    drilldown &&
    neighborhoodStar(neighborhood, layout.rows, allSpecies, drilldown)

  return (
    <div
      className="msv"
      onMouseOver={e => {
        traceHover(e)
      }}
      onFocus={e => {
        traceHover(e)
      }}
      onBlur={e => {
        clearHover(e)
      }}
      onMouseLeave={e => {
        clearHover(e)
      }}
    >
      <style>{hoverRules(neighborhood.anchors)}</style>
      {mode === 'bp' && (
        <AnchorLegend
          anchors={referenceOrder(neighborhood)}
          refGenes={refGenesByAnchor}
          colors={layout.anchorColors}
        />
      )}

      <div className="msv-scroll">
        <svg
          width={layout.width}
          height={layout.height}
          role="group"
          aria-label={`${neighborhood.query.symbol} and its neighbors across ${layout.rows.length} species, the reference first and its relatives nearest first`}
        >
          {mode === 'ordinal' && (
            <g className="msv-headers">
              {layout.columns.map(c => {
                const anchor = neighborhood.anchors.find(
                  a => a.geneId === c.anchorId,
                )
                return (
                  <text
                    key={c.anchorId}
                    data-anchor={c.anchorId}
                    transform={`translate(${c.center - 4},${(layout.rows[0]?.y ?? 0) - 10}) rotate(-40)`}
                    className={
                      c.anchorId === queryId
                        ? 'msv-header msv-header-query'
                        : 'msv-header'
                    }
                  >
                    {anchor?.symbol}
                    <title>
                      {`${anchor?.symbol ?? ''}, ${anchor?.isQuery ? 'the query gene' : 'a neighbor gene'} · hover to trace its orthologs`}
                    </title>
                  </text>
                )
              })}
            </g>
          )}
          <g className="msv-bands">
            {layout.rows
              .filter(row => row.isRef)
              .map(row => (
                <rect
                  key={row.taxonId}
                  x={0}
                  y={row.y - 4}
                  width={layout.width}
                  height={H + 8}
                  className="msv-ref-band"
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
              row.distant > 0
                ? `· ${row.distant} neighbor gene${row.distant > 1 ? 's' : ''} on this scaffold but far from the rest, not drawn in this row`
                : '',
              row.isRef ? '· the reference species' : '',
              row.inverted
                ? "· drawn mirrored, since its genes run opposite the reference's order"
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
                  className={
                    row.isRef ? 'msv-label msv-label-ref' : 'msv-label'
                  }
                >
                  {fitLabel(row.label)}
                  <title>{labelTitle}</title>
                </text>
                {mode === 'bp' && row.genes.length > 0 && (
                  <text
                    x={layout.trackRight + 6}
                    y={row.y + H / 2}
                    dominantBaseline="central"
                    className="msv-span"
                  >
                    {formatSpan(row.spanEnd - row.spanStart)}
                  </text>
                )}
                <g
                  className="msv-elsewhere"
                  transform={`translate(0,${row.y})`}
                >
                  {row.elsewhere.map(g => {
                    const href = geneHref(g, false)
                    const title = `${g.symbol} · ${row.label} · ${elsewhereText(g, row.genes[0], row.spanStart, row.spanEnd)}${href ? ' · open in JBrowse' : ''}`
                    return (
                      <Launch
                        key={g.anchorId}
                        href={href}
                        title={title}
                      >
                        <rect
                          data-anchor={g.anchorId}
                          x={g.x + 0.5}
                          y={0.5}
                          width={g.width - 1}
                          height={H - 1}
                          stroke={layout.anchorColors.get(g.anchorId) ?? '#999'}
                        >
                          <title>{title}</title>
                        </rect>
                      </Launch>
                    )
                  })}
                </g>
                <g
                  className="msv-genes"
                  transform={`translate(0,${row.y})`}
                >
                  {row.genes.map(g => {
                    const href = geneHref(g, row.inverted)
                    const action = href
                      ? ' · open in JBrowse'
                      : drilldown && !drilldown.unavailable
                        ? ' · not a genome we host'
                        : ''
                    const title = `${g.symbol} · ${row.label} · ${locusText(g.refName, g.start, g.end, g.strand)} strand${row.inverted ? ', drawn mirrored' : ''}${action}`
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
                          style={{ cursor: href ? 'pointer' : 'default' }}
                        >
                          <title>{title}</title>
                        </path>
                        {g.displaced && (
                          <text
                            x={g.x + g.width / 2}
                            y={H / 2}
                            className="msv-displaced"
                          >
                            {g.symbol}
                          </text>
                        )}
                      </Launch>
                    )
                  })}
                </g>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="msv-under">
        {star && (
          <LaunchLink
            href={star.url}
            title="One lane per genome, each placed by its whole-genome alignment to the reference, or by NCBI's orthologs where the alignment misses the gene"
          >
            Open {neighborhood.query.symbol} in JBrowse across {star.genomes}{' '}
            genomes
          </LaunchLink>
        )}
        {children}
      </p>
    </div>
  )
}
