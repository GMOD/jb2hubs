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

// How many rows carry each domain name.
function prevalence(rows: ProteinPanelRow[]) {
  const count = new Map<string, number>()
  for (const r of rows) {
    for (const name of new Set(r.domains.map(d => d.name))) {
      count.set(name, (count.get(name) ?? 0) + 1)
    }
  }
  return count
}

// A CDD hit landing on a single row out of dozens is a low-specificity model
// rather than a real difference: BRCA2 picks up a 128-character "Replication
// protein A, class 2b aminoacyl-tRNA synthetases…" and NOTCH1 and DMD collect
// three or four such singletons each. Every one costs a legend entry and says
// nothing, so a broad panel drops them.
//
// A small panel keeps everything, because there one row IS the pattern — TP53's
// primate-only TAD2 shows up on 1 of 9 rows and is the most interesting thing in
// that panel.
const BROAD_PANEL_ROWS = 20

// Same domain name -> same color across every row, so a shared domain reads as a
// vertically-aligned color band down the panel. Ordered by prevalence, which
// spends the strongest palette entries on the bands that run the whole way down
// and puts the legend in the order the eye meets it.
function assignColors(rows: ProteinPanelRow[]) {
  const count = prevalence(rows)
  const floor = rows.length >= BROAD_PANEL_ROWS ? 2 : 1
  const names = [...count]
    .filter(([, n]) => n >= floor)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
  return new Map(names.map((name, i) => [name, PALETTE[i % PALETTE.length]!]))
}

export default function ProteinDomainCartoon({
  rows,
}: {
  rows: ProteinPanelRow[]
}) {
  const maxLength = Math.max(...rows.map(r => r.length), 1)
  const colors = assignColors(rows)
  const counts = prevalence(rows)

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
                {r.domains
                  .filter(d => colors.has(d.name))
                  .map((d, i) => (
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
              title={`${name} · ${counts.get(name)} of ${rows.length} species`}
            >
              <span
                className="pdc-swatch"
                style={{ background: color }}
              />
              <span className="pdc-legend-name">{name}</span>
              <span className="pdc-legend-count">{counts.get(name)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
