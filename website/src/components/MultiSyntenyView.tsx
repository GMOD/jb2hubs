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
  layoutNeighborhood,
  ribbonPath,
} from './multiSyntenyLayout.ts'
import { locusText } from './orthologSearchUtils.ts'

import type { Anchor, Neighborhood, SpeciesRow } from './neighborhood.ts'
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
}

// Hovering a gene, ribbon or legend swatch traces one ortholog down the whole
// view: its genes and ribbon chain stay vivid while everything else dims. The
// wrapper carries `data-focus`, set straight on the DOM from one delegated
// handler, and the rules below light the matching elements — no React state, so
// a hover over one of ~900 paths re-renders nothing.
function traceHover(e: SyntheticEvent<HTMLDivElement>) {
  const target = e.target instanceof Element ? e.target : undefined
  const focus = target?.closest('[data-anchor]')?.getAttribute('data-anchor')
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
// like) is in conserved-gene-order.astro. Rendered only on the client, so the
// selector quotes reach the sheet verbatim.
function hoverRules(anchors: Anchor[]) {
  return anchors
    .map(
      a =>
        `.msv[data-focus="${a.geneId}"] [data-anchor="${a.geneId}"]{--msv-on:1}`,
    )
    .join('\n')
}

// A legend, not symbols over the reference row's columns: tried 2026-10-15,
// those misled, since an ordinal row packs its genes left and gelada's HBG2
// sat under human's HBD.
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
}: Props) {
  const layout = useMemo(
    () =>
      layoutNeighborhood(neighborhood, {
        mode,
        ...(mode === 'ordinal' && { spanWidth: 0 }),
      }),
    [neighborhood, mode],
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
      <AnchorLegend
        anchors={neighborhood.anchors}
        colors={layout.anchorColors}
      />
      {star && (
        <p className="ui-hint">
          <LaunchLink
            href={star.url}
            title="One lane per genome, each placed by its whole-genome alignment to the reference, or by NCBI's orthologs where the alignment misses the gene"
          >
            Open {neighborhood.query.symbol} in JBrowse across {star.genomes}{' '}
            genomes
          </LaunchLink>
        </p>
      )}

      <div className="msv-scroll">
        <svg
          width={layout.width}
          height={layout.height}
          role="group"
          aria-label={`${neighborhood.query.symbol} and its neighbors across ${layout.rows.length} species, in taxonomy order`}
        >
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
                  className={
                    row.isRef ? 'msv-label msv-label-ref' : 'msv-label'
                  }
                >
                  {row.label}
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
                    const title = `${g.symbol} · ${row.label} · ${locusText(g.refName, g.start, g.end, g.strand)} strand${action}`
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
