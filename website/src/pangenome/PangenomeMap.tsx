import '../styles/pangenome.css'

import { useState } from 'react'

import {
  MIN_LABELLED,
  labelled,
  packRows,
  placed,
  placement,
  rulerTicks,
  scale,
  spanStyle,
} from './pangenomeMapLayout.ts'
import { gains, sizeOf } from './pangenomeMarks.ts'
import {
  alignedAt,
  changeKey,
  nameChange,
  notAligned,
  rowNameNotes,
} from './pangenomePanels.ts'
import { bp, percent } from './pangenomeProse.ts'

import type { FormMark } from './pangenomeMarks.ts'
import type { StructuralPanel } from './pangenomePanels.ts'
import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'

type Lane = StructuralPanel['lanes'][number]

function Ruler({ region }: { region: ParsedRegion }) {
  const x = scale(region)
  const { ticks, digits } = rulerTicks(region)
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
            style={spanStyle(placed(region, g.start, g.end))}
            title={`${g.symbol}, ${bp(g.end - g.start)}`}
          >
            {x(g.end) - x(g.start) >= MIN_LABELLED ? g.symbol : ''}
          </span>
        ))}
        {row
          .filter(
            g => named.has(g.symbol) && x(g.end) - x(g.start) < MIN_LABELLED,
          )
          .map(g => (
            <span
              key={`${g.symbol} label`}
              className="ui-gene-label"
              style={
                x(g.end) < 0.85
                  ? { left: `${100 * x(g.end)}%` }
                  : { right: `${100 * (1 - x(g.start))}%` }
              }
            >
              {g.symbol}
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

const look = (m: FormMark) =>
  m.kind === 'replacement' || m.kind === 'net'
    ? `replacement ${gains(m) ? 'gain' : 'loss'}`
    : m.kind === 'bypassed'
      ? 'uncalled'
      : m.kind

const LEGEND = [
  { look: 'deletion', says: 'deletion' },
  { look: 'insertion', says: 'insertion' },
  { look: 'duplication', says: 'duplicated stretch' },
  { look: 'inversion', says: 'inversion' },
  { look: 'replacement loss', says: 'shorter sequence here' },
  { look: 'replacement gain', says: 'longer sequence here' },
  { look: 'shift', says: 'realigned: the sequence aligns elsewhere' },
  { look: 'rarer', says: 'a change under 1% carry' },
  { look: 'uncalled', says: 'not aligned, or another route' },
]

// The marks this window draws, each named once, in the order LEGEND gives, and
// what its rows' names mean.
function Legend({
  panel,
  referenceLabel,
}: {
  panel: StructuralPanel
  referenceLabel: string
}) {
  const drawn = new Set(panel.lanes.flatMap(l => l.marks.map(look)))
  const notes = rowNameNotes(panel)
  return (
    <div className="ui-legend">
      <ul>
        {LEGEND.filter(l => drawn.has(l.look)).map(l => (
          <li key={l.look}>
            <span className={`ui-mark ${l.look}`} />
            {l.says}
          </li>
        ))}
      </ul>
      <p>
        Each row is a form some haplotypes share, named by its largest change
        from {referenceLabel}.{notes.map(n => ` ${n}.`).join('')}
      </p>
    </div>
  )
}

function markTitle(
  m: FormMark,
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
  const what = nameChange(panel, m)
  const aligned = alignedAt(panel, m)
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
  onFocus?: () => void
}) {
  const unaligned = notAligned(lane.marks)
  const drawn = lane.marks.map(m => ({ m, p: placement(m, region) }))
  const sized = labelled(drawn.map(d => d.p))
  const body = (
    <>
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
            style={spanStyle(placed(region, g.start, g.end))}
          />
        ))}
        {drawn.map(({ m, p }, i) => {
          const key = changeKey(m)
          return (
            <span
              key={i}
              className={`ui-mark ${look(m)}${p.clipLeft ? ' clip-left' : ''}${p.clipRight ? ' clip-right' : ''}${lit === key ? ' lit' : ''}`}
              style={spanStyle(p)}
              title={markTitle(m, carriers.get(key), panel)}
              onMouseEnter={() => {
                onHover(carriers.has(key) ? key : undefined)
              }}
              onMouseLeave={() => {
                onHover(undefined)
              }}
            >
              {!sized[i]
                ? ''
                : m.kind === 'replacement' || m.kind === 'net'
                  ? `${gains(m) ? '+' : '−'}${bp(sizeOf(m))}`
                  : m.kind === 'deletion' ||
                      m.kind === 'shift' ||
                      m.kind === 'duplication'
                    ? bp(sizeOf(m))
                    : ''}
            </span>
          )
        })}
      </span>
      <Share
        n={lane.shares}
        of={panel.placed}
      />
    </>
  )
  const about = `${!lane.label || label === lane.structure ? label : `${label}: ${lane.structure}`}, ${lane.shares} of ${panel.placed} haplotypes, ${lane.haplotype} among them`
  return onFocus ? (
    <button
      type="button"
      className="ui-lane ui-lane-btn"
      aria-pressed={focused}
      aria-disabled={unaligned}
      aria-label={about}
      onClick={unaligned ? undefined : onFocus}
    >
      {body}
    </button>
  ) : (
    <div
      className="ui-lane"
      title={about}
    >
      {body}
    </div>
  )
}

// One row per structural form, under a ruler and the window's genes, each with
// its share of the haplotypes placed here. Given `onFocus`, a row is a button:
// the focused form is what the launch opens on. Hovering a change lights it in
// every row that carries it, with how many haplotypes do.
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
  onFocus?: (haplotype?: string) => void
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
    <>
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
            onFocus={
              onFocus &&
              (() => {
                onFocus(focus === lane.haplotype ? undefined : lane.haplotype)
              })
            }
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
      <Legend
        panel={panel}
        referenceLabel={referenceLabel}
      />
    </>
  )
}
