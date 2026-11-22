import '../styles/pangenome.css'

import { useState } from 'react'

import {
  MIN_LABELLED,
  packRows,
  placed,
  placement,
  rulerTicks,
  scale,
  spanStyle,
} from './pangenomeMapLayout.ts'
import { gains } from './pangenomeMarks.ts'
import {
  alignedAt,
  changeKey,
  nameChange,
  notAligned,
  plainName,
} from './pangenomePanels.ts'
import { bp, percent } from './pangenomeProse.ts'

import type { FormMark } from './pangenomeMarks.ts'
import type { PanelRow, StructuralPanel } from './pangenomePanels.ts'
import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'

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
      key={row.map(g => g.symbol).join(' ')}
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

function Legend({ panel, hint }: { panel: StructuralPanel; hint?: string }) {
  const drawn = new Set(panel.rows.flatMap(r => r.marks.map(look)))
  return (
    <ul className="ui-legend">
      {LEGEND.filter(l => drawn.has(l.look)).map(l => (
        <li key={l.look}>
          <span className={`ui-mark ${l.look}`} />
          {l.says}
        </li>
      ))}
      {hint && <li className="ui-legend-hint">{hint}</li>}
    </ul>
  )
}

const STATE_TITLES = {
  uncalled: 'Not aligned here',
  bypassed: 'On another route through a larger variant',
  rarer: 'A change fewer than 1% carry',
}

function changeTitle(
  m: FormMark,
  carriers: number | undefined,
  panel: StructuralPanel,
) {
  const plain = plainName(m)
  const named = nameChange(panel, m)
  const what = named === plain ? plain : `${named} (${plain})`
  const aligned = alignedAt(panel, m)
  return carriers === undefined
    ? what
    : `${what}: ${carriers} of ${aligned} haplotypes aligned here (${percent(carriers, aligned)})`
}

const markTitle = (
  m: FormMark,
  carriers: number | undefined,
  panel: StructuralPanel,
) =>
  m.kind === 'uncalled' || m.kind === 'bypassed' || m.kind === 'rarer'
    ? STATE_TITLES[m.kind]
    : changeTitle(m, carriers, panel)

function FormRow({
  row,
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
  row: PanelRow
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
  const unaligned = notAligned(row.marks)
  const about = [
    !row.label || label === row.structure
      ? label
      : `${label}: ${row.structure}`,
    `${row.shares} of ${panel.placed} haplotypes`,
    ...(row.haplotype ? [`${row.haplotype} among them`] : []),
    ...(row.forms > 1
      ? [`${row.forms} forms that differ by smaller changes`]
      : []),
  ].join(', ')
  const body = (
    <>
      <span
        className="ui-lane-name"
        title={about}
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
        {row.marks.map((m, i) => {
          const key = changeKey(m)
          const p = placement(m, region)
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
            />
          )
        })}
      </span>
      <span className="ui-lane-share">{percent(row.shares, panel.placed)}</span>
    </>
  )
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
    <div className="ui-lane">{body}</div>
  )
}

function CountRow({
  name,
  share,
  title,
}: {
  name: string
  share?: string
  title?: string
}) {
  return (
    <div
      className="ui-lane ui-lane-rest"
      title={title}
    >
      <span className="ui-lane-name">{name}</span>
      <span className="ui-track" />
      <span className="ui-lane-share">{share}</span>
    </div>
  )
}

// The reference's structure, then one row per group of structural forms, under
// a ruler and the window's genes, each with its share of the haplotypes placed
// here. Given `onFocus`, a row with a haplotype is a button: the focused one is
// what the launch opens on. Hovering a change lights it in every row that
// carries it, with how many haplotypes do.
export default function PangenomeMap({
  region,
  genes,
  named,
  referenceLabel,
  panel,
  focus,
  hint,
  onFocus,
}: {
  region: ParsedRegion
  genes: WindowGene[]
  named: string[]
  referenceLabel: string
  panel: StructuralPanel
  focus?: string
  hint?: string
  onFocus?: (haplotype?: string) => void
}) {
  const [lit, setLit] = useState<string>()
  const namedSet = new Set(named)
  const shade = genes.filter(g => namedSet.has(g.symbol))
  const carriers = new Map(
    panel.changes.map(c => [changeKey(c.mark), c.carriers]),
  )
  const { rows, placed: aligned, unplaced } = panel
  const shown = rows.reduce((n, r) => n + r.shares, 0)
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
        {rows.map(row => {
          const { haplotype } = row
          return (
            <FormRow
              key={haplotype ?? ''}
              row={row}
              label={row.label || `${referenceLabel}'s structure`}
              region={region}
              shade={shade}
              panel={panel}
              carriers={carriers}
              lit={lit}
              focused={haplotype !== undefined && focus === haplotype}
              onHover={setLit}
              onFocus={
                onFocus && haplotype
                  ? () => {
                      onFocus(focus === haplotype ? undefined : haplotype)
                    }
                  : undefined
              }
            />
          )
        })}
        {aligned > shown && (
          <CountRow
            name="other forms"
            share={percent(aligned - shown, aligned)}
          />
        )}
        {unplaced * 100 >= aligned + unplaced && (
          <CountRow
            name={`${unplaced} not aligned here`}
            title={`${unplaced} of ${aligned + unplaced} haplotypes are not aligned in this window; shares are of the other ${aligned}`}
          />
        )}
      </div>
      <Legend
        panel={panel}
        hint={hint}
      />
    </>
  )
}
