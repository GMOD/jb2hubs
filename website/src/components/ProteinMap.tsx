import { useState } from 'react'

import {
  type Focus,
  type ProteinRegion,
  residueRuns,
  sameFocus,
} from './proteinFeatures.ts'

import type { CSSProperties } from 'react'

// One protein, end to end, with what is known about where things are on it:
// its InterPro domains, its conserved sites, and — on request — the residues
// PDBe has seen touching each partner. Every block is a button that makes the
// session open on that range, and a domain with a Pfam family offers that
// family's seed alignment as the alignment to open with.
//
// This is the orientation layer: the picture a reader forms before launching a
// three-view session, so the session can open on one thing rather than on
// everything. It draws from the query protein alone, which is why it appears in
// a second or two while the cross-species panel is still resolving.

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

// Same accession, same colour, in order of first appearance along the protein.
function colorsByAccession(regions: ProteinRegion[]) {
  const colors = new Map<string, string>()
  for (const r of regions) {
    const key = r.accession ?? r.name
    if (!colors.has(key)) {
      colors.set(key, PALETTE[colors.size % PALETTE.length]!)
    }
  }
  return colors
}

// Greedy lane packing: a region goes in the first lane whose last block ends
// before it starts, so overlapping entries (a kinase domain and the catalytic
// domain inside it) stack instead of hiding each other.
function packLanes<T extends { start: number; end: number }>(items: T[]) {
  const lanes: { end: number; items: T[] }[] = []
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    const lane = lanes.find(l => l.end < item.start)
    if (lane) {
      lane.end = item.end
      lane.items.push(item)
    } else {
      lanes.push({ end: item.end, items: [item] })
    }
  }
  return lanes.map(l => l.items)
}

function tickStep(length: number) {
  return length > 2000 ? 500 : length > 800 ? 200 : length > 300 ? 100 : 50
}

export type PartnersState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; partners: ProteinRegion[] }

export default function ProteinMap({
  length,
  regions,
  partners,
  onLoadPartners,
  focus,
  onFocus,
}: {
  // residues in the canonical sequence
  length: number
  // InterPro domains, repeats and sites
  regions: ProteinRegion[]
  partners: PartnersState
  onLoadPartners: () => void
  focus: Focus | undefined
  onFocus: (focus: Focus | undefined) => void
}) {
  const [residueText, setResidueText] = useState('')
  const domains = regions.filter(
    r => r.kind === 'domain' || r.kind === 'repeat',
  )
  const sites = regions.filter(r => r.kind === 'site')
  const colors = colorsByAccession([...domains, ...sites])
  const pct = (residue: number) => `${((residue - 1) / length) * 100}%`
  const width = (start: number, end: number) =>
    `${((end - start + 1) / length) * 100}%`
  const toggle = (next: Focus) => {
    onFocus(sameFocus(focus, next) ? undefined : next)
  }
  const isFocused = (region: ProteinRegion) =>
    sameFocus(focus, { kind: 'region', region })

  const block = (region: ProteinRegion, style: CSSProperties) => (
    <button
      type="button"
      key={`${region.accession}-${region.start}-${region.end}`}
      className={isFocused(region) ? 'pm-block selected' : 'pm-block'}
      style={style}
      title={`${region.name} · ${region.start}–${region.end}${region.pfam ? ` · ${region.pfam}` : ''} — open the session on this`}
      aria-pressed={isFocused(region)}
      onClick={() => {
        toggle({ kind: 'region', region })
      }}
    >
      <span className="pm-block-label">{region.name}</span>
    </button>
  )

  const step = tickStep(length)
  const ticks = Array.from(
    { length: Math.floor(length / step) },
    (_, i) => (i + 1) * step,
  )

  return (
    <div className="pm">
      <div className="pm-lanes">
        <div className="pm-lane pm-ruler">
          <span className="pm-lane-name" />
          <div className="pm-track">
            {ticks.map(t => (
              <span
                key={t}
                className="pm-tick"
                style={{ left: pct(t) }}
              >
                {t}
              </span>
            ))}
            <span className="pm-tick pm-tick-end">{length} aa</span>
          </div>
        </div>

        {domains.length === 0 && sites.length === 0 ? (
          <p className="ui-note">
            InterPro annotates no domains on this protein.
          </p>
        ) : null}

        {packLanes(domains).map((lane, i) => (
          <div
            className="pm-lane"
            key={`domains-${i}`}
          >
            <span className="pm-lane-name">{i === 0 ? 'Domains' : ''}</span>
            <div className="pm-track">
              {lane.map(r =>
                block(r, {
                  left: pct(r.start),
                  width: width(r.start, r.end),
                  background: colors.get(r.accession ?? r.name),
                }),
              )}
            </div>
          </div>
        ))}

        {sites.length > 0 &&
          packLanes(sites).map((lane, i) => (
            <div
              className="pm-lane pm-lane-thin"
              key={`sites-${i}`}
            >
              <span className="pm-lane-name">{i === 0 ? 'Sites' : ''}</span>
              <div className="pm-track">
                {lane.map(r =>
                  block(r, {
                    left: pct(r.start),
                    width: width(r.start, r.end),
                    background: colors.get(r.accession ?? r.name),
                  }),
                )}
              </div>
            </div>
          ))}

        {partners.status === 'loaded' &&
          partners.partners.map(p => (
            <div
              className="pm-lane pm-lane-thin"
              key={`${p.accession}-${p.name}`}
            >
              <span
                className="pm-lane-name pm-partner"
                title={`${p.name} (${p.accession}) · ${p.residues?.length ?? 0} interface residues in ${p.pdbIds?.length ?? 0} PDB entries`}
              >
                {p.name}
              </span>
              <div className="pm-track">
                <button
                  type="button"
                  className={
                    isFocused(p) ? 'pm-interface selected' : 'pm-interface'
                  }
                  title={`Open the session on the ${p.name} interface (${p.start}–${p.end}), in ${p.pdbIds?.[0]?.toUpperCase() ?? 'a PDB entry'} with the partner`}
                  aria-pressed={isFocused(p)}
                  onClick={() => {
                    toggle({ kind: 'region', region: p })
                  }}
                >
                  {residueRuns(p.residues ?? []).map(run => (
                    <span
                      key={run.start}
                      className="pm-run"
                      style={{
                        left: pct(run.start),
                        width: width(run.start, run.end),
                      }}
                    />
                  ))}
                </button>
              </div>
            </div>
          ))}

        {focus?.kind === 'residue' && (
          <div className="pm-lane pm-lane-thin">
            <span className="pm-lane-name">Residue</span>
            <div className="pm-track">
              <span
                className="pm-residue"
                style={{ left: pct(focus.position) }}
                title={`residue ${focus.position}`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="pm-actions">
        {partners.status === 'idle' && (
          <button
            type="button"
            className="ui-linkbtn"
            onClick={() => {
              onLoadPartners()
            }}
          >
            Show binding partners from PDBe
          </button>
        )}
        {partners.status === 'loading' && (
          <span className="ui-caption">Reading interfaces from PDBe…</span>
        )}
        {partners.status === 'error' && (
          <span className="ui-error">
            Could not read interfaces: {partners.message}{' '}
            <button
              type="button"
              className="ui-linkbtn"
              onClick={() => {
                onLoadPartners()
              }}
            >
              Try again
            </button>
          </span>
        )}
        {partners.status === 'loaded' && partners.partners.length === 0 && (
          <span className="ui-caption">
            PDBe has no structure of this protein in a complex.
          </span>
        )}
        <form
          className="pm-residue-form"
          onSubmit={e => {
            e.preventDefault()
            const position = Number(residueText)
            if (
              Number.isInteger(position) &&
              position >= 1 &&
              position <= length
            ) {
              onFocus({ kind: 'residue', position })
            }
          }}
        >
          <label className="ui-caption">
            Residue{' '}
            <input
              className="ui-input pm-residue-input"
              inputMode="numeric"
              placeholder={`1–${length}`}
              value={residueText}
              onChange={e => {
                setResidueText(e.target.value)
              }}
            />
          </label>
          <button
            type="submit"
            className="ui-btn-secondary"
          >
            Focus
          </button>
        </form>
      </div>
    </div>
  )
}
