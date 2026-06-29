import type { Bin } from './pangenomeData.ts'

// Horizontal bar chart; bars are scaled to the largest count (min 1 so an
// all-zero set doesn't divide by zero). `title` is optional — the per-sample
// burden chart supplies its own heading.
export default function PangenomeBarChart({
  title,
  bins,
}: {
  title?: string
  bins: Bin[]
}) {
  const max = Math.max(1, ...bins.map(b => b.count))
  return (
    <div className="pg-chart">
      {title ? <h4 className="pg-chart-title">{title}</h4> : null}
      {bins.map(b => (
        <div
          key={b.label}
          className="pg-bar-row"
        >
          <span className="pg-bar-label">{b.label}</span>
          <span className="pg-bar-track">
            <span
              className="pg-bar-fill"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </span>
          <span className="pg-bar-count">{b.count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}
