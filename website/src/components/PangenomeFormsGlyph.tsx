import type { StructuralPanel } from './pangenomePanels.ts'
import type { ParsedRegion } from './pangenomeRegion.ts'
import type { SiteMark } from './pangenomeSvStates.ts'
import type { ReactNode } from 'react'

// The svType preset's colors, so a form reads the same here as in the matrix.
const DELETION = '#e41a1c'
const INSERTION = '#800080'
const INVERSION = '#ff7f00'

const WIDTH = 1000
const HEIGHT = 12
const MIN_WIDTH = 3

function Track({
  region,
  children,
}: {
  region: ParsedRegion
  children: (x: (bp: number) => number) => ReactNode
}) {
  const span = region.end - region.start
  const x = (bp: number) =>
    (Math.min(Math.max(bp, region.start), region.end) - region.start) *
    (WIDTH / span)
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="ui-forms-track"
      aria-hidden="true"
    >
      <rect
        y={HEIGHT / 2 - 0.5}
        width={WIDTH}
        height={1}
        className="ui-forms-line"
      />
      {children(x)}
    </svg>
  )
}

// A deletion is drawn its own length, centred in its site's reference span:
// the sidecar says how much a form loses there, not which bases.
function Mark({ mark, x }: { mark: SiteMark; x: (bp: number) => number }) {
  const { start, end, change } = mark
  const block = (from: number, to: number, fill: string, height: number) => {
    const width = Math.max(x(to) - x(from), MIN_WIDTH)
    return (
      <rect
        x={(x(from) + x(to) - width) / 2}
        y={(HEIGHT - height) / 2}
        width={width}
        height={height}
        fill={fill}
      />
    )
  }
  if (change === 'inversion') {
    return block(start, end, INVERSION, 8)
  }
  if (change === 'uncalled') {
    return block(start, end, 'var(--surface)', 2)
  }
  if (change === 'rarer') {
    const mid = (start + end) / 2
    return block(mid, mid, 'var(--faint)', HEIGHT)
  }
  if (change > 0) {
    const mid = (start + end) / 2
    return block(mid, mid, INSERTION, HEIGHT)
  }
  const mid = (start + end) / 2
  const half = Math.min(-change, end - start) / 2
  return block(mid - half, mid + half, DELETION, 8)
}

// The forms a window's haplotypes carry, one row each, under the reference with
// the gene drawn on it: a simplified picture of what the haplotype lanes draw.
export default function PangenomeFormsGlyph({
  region,
  gene,
  title,
  referenceLabel,
  panel,
  haplotypes,
}: {
  region: ParsedRegion
  gene?: { start: number; end: number }
  title?: string
  referenceLabel: string
  panel: StructuralPanel
  haplotypes: number
}) {
  return (
    <div className="ui-forms">
      <div className="ui-forms-row">
        <Track region={region}>
          {x =>
            gene && (
              <rect
                x={x(gene.start)}
                y={HEIGHT / 2 - 3}
                width={Math.max(x(gene.end) - x(gene.start), MIN_WIDTH)}
                height={6}
                className="ui-forms-gene"
              />
            )
          }
        </Track>
        <span>
          {gene && title ? `${title}, ${referenceLabel}` : referenceLabel}
        </span>
        <span />
      </div>
      {panel.lanes.map(lane => (
        <div
          key={lane.haplotype}
          className="ui-forms-row"
          title={`${lane.shares.toLocaleString('en-US')} haplotypes, ${lane.haplotype} among them`}
        >
          <Track region={region}>
            {x =>
              lane.marks.map(m => (
                <Mark
                  key={`${m.start}-${m.end}`}
                  mark={m}
                  x={x}
                />
              ))
            }
          </Track>
          <span>{lane.structure}</span>
          <span className="ui-forms-share">
            {((100 * lane.shares) / haplotypes).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  )
}
