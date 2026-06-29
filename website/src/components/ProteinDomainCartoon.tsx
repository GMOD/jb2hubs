import type { ProteinPanelRow } from './proteinMsa.ts'

// Domain-architecture cartoon: one length-scaled bar per ortholog with its CDD
// conserved domains drawn as colored blocks. Renders straight from the NCBI
// panel (no alignment), so it appears in seconds and answers the common first
// question — "do these orthologs share the same domains?" — before the user
// pays for the full alignment.

const PALETTE = [
  '#4e79a7',
  '#f28e2b',
  '#59a14f',
  '#e15759',
  '#76b7b2',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ac',
]

// Same domain name -> same color across every row, so a shared domain reads as a
// vertically-aligned color band down the panel.
function assignColors(rows: ProteinPanelRow[]) {
  const names = [...new Set(rows.flatMap(r => r.domains.map(d => d.name)))]
  return new Map(names.map((name, i) => [name, PALETTE[i % PALETTE.length]!]))
}

export default function ProteinDomainCartoon({
  rows,
}: {
  rows: ProteinPanelRow[]
}) {
  const maxLength = Math.max(...rows.map(r => r.length), 1)
  const colors = assignColors(rows)

  return (
    <div className="pdc">
      <div className="pdc-rows">
        {rows.map(r => (
          <div
            className="pdc-row"
            key={r.label}
          >
            <div
              className="pdc-name"
              title={`${r.scientificName} · ${r.protein}`}
            >
              {r.commonName ?? r.scientificName}
            </div>
            <div className="pdc-track">
              <div
                className="pdc-bar"
                style={{ width: `${(r.length / maxLength) * 100}%` }}
              >
                {r.domains.map((d, i) => (
                  <div
                    className="pdc-domain"
                    key={`${d.name}-${d.start}-${i}`}
                    title={`${d.name} (${d.start}–${d.end})`}
                    style={{
                      left: `${((d.start - 1) / r.length) * 100}%`,
                      width: `${((d.end - d.start + 1) / r.length) * 100}%`,
                      background: colors.get(d.name),
                    }}
                  />
                ))}
              </div>
              <span className="pdc-len">{r.length} aa</span>
            </div>
          </div>
        ))}
      </div>
      {colors.size > 0 && (
        <div className="pdc-legend">
          {[...colors].map(([name, color]) => (
            <span
              className="pdc-legend-item"
              key={name}
            >
              <span
                className="pdc-swatch"
                style={{ background: color }}
              />
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
