import type { Domain, ProteinPanelRow } from './proteinMsa.ts'

// Domain-architecture cartoon: one length-scaled bar per ortholog with its CDD
// conserved domains drawn as colored blocks. Renders straight from the NCBI
// panel (no alignment), so it appears in seconds and answers the common first
// question — "do these orthologs share the same domains?" — before the user
// pays for the full alignment.
//
// It is also where two launch options are chosen: a domain on the query row can
// be clicked to open the session with it highlighted, and any row with a
// Swiss-Prot accession can be marked for superposition on the query's structure.

// Tableau 10, then its light companions. Ten was not enough once panels went
// broad: NOTCH1 shows 12 domains and DMD 13, so the modulo wrapped and gave a
// full-height band the same color as a rare domain — which reads as that band
// occurring where it does not, the exact misreading the shared-color scheme
// exists to prevent. Twenty covers every panel measured; beyond that the wrap
// returns, so keep an eye on the legend when adding genes.
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
  '#a0cbe8',
  '#ffbe7d',
  '#8cd17d',
  '#ff9d9a',
  '#86bcb6',
  '#f1ce63',
  '#d4a6c8',
  '#fabfd2',
  '#d7b5a6',
  '#79706e',
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
function assignColors(count: Map<string, number>, rowCount: number) {
  const floor = rowCount >= BROAD_PANEL_ROWS ? 2 : 1
  const names = [...count]
    .filter(([, n]) => n >= floor)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
  return new Map(names.map((name, i) => [name, PALETTE[i % PALETTE.length]!]))
}

const sameDomain = (a: Domain, b: Domain) =>
  a.name === b.name && a.start === b.start && a.end === b.end

export default function ProteinDomainCartoon({
  rows,
  queryTaxId,
  selectedDomain,
  onSelectDomain,
  superposed,
  onToggleSuperpose,
}: {
  rows: ProteinPanelRow[]
  queryTaxId: number
  selectedDomain?: Domain
  onSelectDomain?: (domain: Domain) => void
  // Swiss-Prot accessions currently marked for superposition
  superposed?: string[]
  onToggleSuperpose?: (uniprot: string) => void
}) {
  const maxLength = Math.max(...rows.map(r => r.length), 1)
  const counts = prevalence(rows)
  const colors = assignColors(counts, rows.length)
  const marked = new Set(superposed)

  return (
    <div className="pdc">
      {onToggleSuperpose && (
        <p className="ui-caption pdc-howto">
          Click a domain on the query row to open the session with it
          highlighted. Mark other species to superpose their AlphaFold model on
          the query&rsquo;s.
        </p>
      )}
      <div className="pdc-rows">
        {rows.map(r => {
          const isQuery = r.taxId === queryTaxId
          const canSuperpose = !isQuery && !!r.uniprot && !!onToggleSuperpose
          return (
            <div
              className={isQuery ? 'pdc-row pdc-row-query' : 'pdc-row'}
              key={r.label}
            >
              <div
                className="pdc-name"
                title={`${r.scientificName} · ${r.protein}`}
              >
                {r.commonName ?? r.scientificName}
              </div>
              <span className="pdc-superpose-cell">
                {canSuperpose && (
                  <button
                    className={
                      marked.has(r.uniprot!)
                        ? 'pdc-superpose on'
                        : 'pdc-superpose'
                    }
                    title={
                      marked.has(r.uniprot!)
                        ? `Stop superposing ${r.scientificName}`
                        : `Superpose the ${r.scientificName} AlphaFold model (${r.uniprot})`
                    }
                    aria-pressed={marked.has(r.uniprot!)}
                    onClick={() => {
                      onToggleSuperpose(r.uniprot!)
                    }}
                  >
                    3D
                  </button>
                )}
              </span>
              <div className="pdc-track">
                <div
                  className="pdc-bar"
                  style={{ width: `${(r.length / maxLength) * 100}%` }}
                >
                  {r.domains
                    .filter(d => colors.has(d.name))
                    .map((d, i) => {
                      const clickable = isQuery && !!onSelectDomain
                      const selected =
                        isQuery &&
                        !!selectedDomain &&
                        sameDomain(d, selectedDomain)
                      return (
                        <div
                          className={[
                            'pdc-domain',
                            clickable ? 'clickable' : '',
                            selected ? 'selected' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          key={`${d.name}-${d.start}-${i}`}
                          title={`${d.name} (${d.start}–${d.end})${clickable ? ' — click to highlight at launch' : ''}`}
                          role={clickable ? 'button' : undefined}
                          onClick={
                            clickable
                              ? () => {
                                  onSelectDomain(d)
                                }
                              : undefined
                          }
                          style={{
                            left: `${((d.start - 1) / r.length) * 100}%`,
                            width: `${((d.end - d.start + 1) / r.length) * 100}%`,
                            background: colors.get(d.name),
                          }}
                        />
                      )
                    })}
                </div>
                <span className="pdc-len">{r.length} aa</span>
              </div>
            </div>
          )
        })}
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
