import { useState } from 'react'

import { bp, changeKey, changeName } from './pangenomePanels.ts'
import { diffuse } from './pangenomeSvStates.ts'

import type { StructuralPanel } from './pangenomePanels.ts'
import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'
import type { SiteMark } from './pangenomeSvStates.ts'
import type { CSSProperties } from 'react'

type Lane = StructuralPanel['lanes'][number]

// A block narrower than this share of the window shows no size inside it.
const MIN_LABELLED = 0.08

const STEPS = [
  1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000,
]

function tickStep(span: number) {
  return STEPS.find(s => span / s <= 6) ?? 1_000_000
}

const percent = (n: number, of: number) =>
  n > 0 && n < of / 100 ? '<1%' : `${Math.round((100 * n) / of)}%`

// x of a base as a share of the window, clamped to it.
function scale(region: ParsedRegion) {
  const span = region.end - region.start
  return (pos: number) =>
    (Math.min(Math.max(pos, region.start), region.end) - region.start) / span
}

function Ruler({ region }: { region: ParsedRegion }) {
  const x = scale(region)
  const step = tickStep(region.end - region.start)
  const ticks = []
  for (
    let pos = Math.ceil(region.start / step) * step;
    pos < region.end;
    pos += step
  ) {
    if (x(pos) < 0.9) {
      ticks.push(pos)
    }
  }
  const digits = step >= 10_000 ? 2 : 3
  return (
    <div className="ui-lane ui-ruler">
      <span className="ui-lane-name" />
      <div className="ui-track">
        {ticks.map(pos => (
          <span
            key={pos}
            className="ui-tick"
            style={{ left: `${100 * x(pos)}%` }}
          >
            {(pos / 1e6).toFixed(digits)}
          </span>
        ))}
        <span className="ui-tick ui-tick-end">{region.chrom} Mb</span>
      </div>
      <span className="ui-lane-share" />
    </div>
  )
}

// Genes stacked so overlapping ones do not hide each other: TNXB covers
// CYP21A2, RSRP1 covers RHD.
function packRows(genes: WindowGene[]) {
  const rows: { end: number; genes: WindowGene[] }[] = []
  for (const g of [...genes].sort((a, b) => a.start - b.start)) {
    const row = rows.find(r => r.end < g.start)
    if (row) {
      row.end = g.end
      row.genes.push(g)
    } else {
      rows.push({ end: g.end, genes: [g] })
    }
  }
  return rows.map(r => r.genes)
}

function GeneLanes({
  region,
  genes,
  named,
}: {
  region: ParsedRegion
  genes: WindowGene[]
  named: ReadonlySet<string>
}) {
  const x = scale(region)
  return packRows(genes).map((row, i) => (
    <div
      key={row[0]!.symbol}
      className="ui-lane ui-lane-thin"
    >
      <span className="ui-lane-name">{i === 0 ? 'Genes' : ''}</span>
      <div className="ui-track">
        {row.map(g => (
          <span
            key={g.symbol}
            className={`ui-gene${named.has(g.symbol) ? ' named' : ''}`}
            style={{
              left: `${100 * x(g.start)}%`,
              width: `${100 * (x(g.end) - x(g.start))}%`,
            }}
            title={`${g.symbol}, ${bp(g.end - g.start)}`}
          >
            {x(g.end) - x(g.start) >= MIN_LABELLED ? g.symbol : ''}
          </span>
        ))}
      </div>
      <span className="ui-lane-share" />
    </div>
  ))
}

function Share({ n, of }: { n: number; of: number }) {
  return (
    <span className="ui-lane-share">
      <span className="ui-share-bar">
        <span style={{ width: `${(100 * n) / of}%` }} />
      </span>
      {percent(n, of)}
    </span>
  )
}

// Where a mark is drawn, as shares of the window. A deletion is drawn its own
// length centred in its site, then clamped, since the sidecar records how much
// a form loses at a site and not which bases; a diffuse change is drawn as a
// band over the whole site, clamped. An insertion or a rare change is a tick.
function placement(m: SiteMark, region: ParsedRegion) {
  const x = scale(region)
  const mid = (m.start + m.end) / 2
  const [from, to] =
    m.kind === 'deletion' && !diffuse(m)
      ? [
          mid - Math.min(m.bp, m.end - m.start) / 2,
          mid + Math.min(m.bp, m.end - m.start) / 2,
        ]
      : m.kind === 'insertion' && !diffuse(m)
        ? [mid, mid]
        : m.kind === 'rarer'
          ? [mid, mid]
          : [m.start, m.end]
  return {
    left: x(from),
    width: x(to) - x(from),
    clipLeft: from < region.start,
    clipRight: to > region.end,
  }
}

function markClass(m: SiteMark) {
  return diffuse(m) ? `ui-mark ${m.kind} diffuse` : `ui-mark ${m.kind}`
}

function markTitle(
  m: SiteMark,
  carriers: number | undefined,
  panel: StructuralPanel,
) {
  if (m.kind === 'uncalled') {
    return 'Not aligned here'
  }
  if (m.kind === 'bypassed') {
    return 'On another route through a larger variant'
  }
  if (m.kind === 'rarer') {
    return 'A change fewer than 1% carry'
  }
  const what = m.kind === 'inversion' ? 'Inversion' : changeName(m)
  const aligned = panel.siteSpans[m.site]?.aligned ?? 0
  return carriers === undefined
    ? what
    : `${what}: ${carriers} of ${aligned} haplotypes aligned here (${percent(carriers, aligned)})`
}

function FormLane({
  lane,
  label,
  region,
  shade,
  panel,
  carriers,
  lit,
  focused,
  onHover,
  onFocus,
}: {
  lane: Lane
  label: string
  region: ParsedRegion
  shade: WindowGene[]
  panel: StructuralPanel
  carriers: ReadonlyMap<string, number>
  lit?: string
  focused: boolean
  onHover: (key?: string) => void
  onFocus: () => void
}) {
  const x = scale(region)
  return (
    <button
      type="button"
      className="ui-lane ui-lane-btn"
      aria-pressed={focused}
      aria-label={`${label}: ${lane.structure}, ${lane.shares} of ${panel.placed} haplotypes, ${lane.haplotype} among them`}
      onClick={onFocus}
    >
      <span
        className="ui-lane-name"
        title={label}
      >
        {label}
      </span>
      <span className="ui-track">
        {shade.map(g => (
          <span
            key={g.symbol}
            className="ui-shade"
            style={{
              left: `${100 * x(g.start)}%`,
              width: `${100 * (x(g.end) - x(g.start))}%`,
            }}
          />
        ))}
        {lane.marks.map((m, i) => {
          const p = placement(m, region)
          const key = changeKey(m)
          const style: CSSProperties = {
            left: `${100 * p.left}%`,
            width: `${100 * p.width}%`,
          }
          return (
            <span
              key={i}
              className={`${markClass(m)}${p.clipLeft ? ' clip-left' : ''}${p.clipRight ? ' clip-right' : ''}${lit === key ? ' lit' : ''}`}
              style={style}
              title={markTitle(m, carriers.get(key), panel)}
              onMouseEnter={() => {
                onHover(carriers.has(key) ? key : undefined)
              }}
              onMouseLeave={() => {
                onHover(undefined)
              }}
            >
              {p.width >= MIN_LABELLED &&
              !diffuse(m) &&
              (m.kind === 'deletion' || m.kind === 'shifted')
                ? bp(m.bp)
                : ''}
            </span>
          )
        })}
      </span>
      <Share
        n={lane.shares}
        of={panel.placed}
      />
    </button>
  )
}

// One row per structural form, under a ruler and the window's genes, each with
// its share of the haplotypes placed here. A row is a button: the focused form
// is what the launch opens on. Hovering a change lights it in every row that
// carries it, with how many haplotypes do.
export default function PangenomeMap({
  region,
  genes,
  named,
  referenceLabel,
  panel,
  focus,
  onFocus,
}: {
  region: ParsedRegion
  genes: WindowGene[]
  named: string[]
  referenceLabel: string
  panel: StructuralPanel
  focus?: string
  onFocus: (haplotype?: string) => void
}) {
  const [lit, setLit] = useState<string>()
  const namedSet = new Set(named)
  const shade = genes.filter(g => namedSet.has(g.symbol))
  const carriers = new Map(
    panel.changes.map(c => [changeKey(c.mark), c.carriers]),
  )
  const { lanes } = panel
  const shown = lanes.reduce((n, l) => n + l.shares, 0)
  return (
    <div className={`ui-lanes${lit ? ' has-lit' : ''}`}>
      <Ruler region={region} />
      {genes.length > 0 && (
        <GeneLanes
          region={region}
          genes={genes}
          named={namedSet}
        />
      )}
      {lanes.map(lane => (
        <FormLane
          key={lane.haplotype}
          lane={lane}
          label={lane.label || `${referenceLabel}'s structure`}
          region={region}
          shade={shade}
          panel={panel}
          carriers={carriers}
          lit={lit}
          focused={focus === lane.haplotype}
          onHover={setLit}
          onFocus={() => {
            onFocus(focus === lane.haplotype ? undefined : lane.haplotype)
          }}
        />
      ))}
      {panel.placed > shown && (
        <div className="ui-lane ui-lane-rest">
          <span className="ui-lane-name">other forms</span>
          <span className="ui-track" />
          <Share
            n={panel.placed - shown}
            of={panel.placed}
          />
        </div>
      )}
    </div>
  )
}
