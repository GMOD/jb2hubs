import { useState } from 'react'

import {
  type Focus,
  type ProteinRegion,
  residueRuns,
  sameFocus,
} from './proteinFeatures.ts'

import type { CSSProperties, ReactNode } from 'react'

// One protein, end to end, with what is known about where things are on it:
// its InterPro domains, and on request its conserved sites and the residues
// PDBe has seen touching each partner and each ligand. Every block is a button that makes the
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

// A block narrower than this share of the protein shows no label: at that
// width a label is an ellipsis, and the title carries the name.
const MIN_LABELLED = 0.05

function tickStep(length: number) {
  return length > 2000 ? 500 : length > 800 ? 200 : length > 300 ? 100 : 50
}

// Regions read when the reader asks for them: PDBe's partners and ligands.
export type OnRequest =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; regions: ProteinRegion[] }

// A lane whose rows load when its name is clicked, with the wait or the
// failure written in the track.
function RequestLane({
  name,
  hint,
  busy,
  note,
  onClick,
}: {
  name: string
  hint: string
  busy?: boolean
  note?: ReactNode
  onClick: () => void
}) {
  return (
    <div className="pm-lane">
      <button
        type="button"
        className="pm-lane-name pm-lane-btn"
        title={hint}
        aria-busy={busy}
        onClick={onClick}
      >
        {name}…
      </button>
      <div className="pm-track">
        {note && <span className="pm-track-note">{note}</span>}
      </div>
    </div>
  )
}

// What a request lane says and how its loaded rows read: one lane per partner
// or ligand site, its contact residues drawn as runs.
interface ContactKind {
  name: string
  hint: string
  none: string
  laneTitle: (r: ProteinRegion) => string
  blockTitle: (r: ProteinRegion) => string
}

const PARTNERS: ContactKind = {
  name: 'Partners',
  hint: 'The residues PDBe has seen touching each binding partner, in any PDB entry',
  none: 'no complex of this protein in PDBe',
  laneTitle: p =>
    `${p.name} (${p.accession}) · ${p.residues?.length ?? 0} interface residues in ${p.pdbIds?.length ?? 0} PDB entries`,
  blockTitle: p =>
    `Open the session on the ${p.name} interface (${p.start}–${p.end}), in ${p.pdbIds?.[0]?.toUpperCase() ?? 'a PDB entry'} with the partner`,
}

const LIGANDS: ContactKind = {
  name: 'Ligands',
  hint: 'The sites PDBe has seen small molecules bound at, crystallisation additives left out',
  none: 'no bound ligand of this protein in PDBe',
  laneTitle: l =>
    `${(l.ligands ?? [])
      .map(x => `${x.id} ${x.name.toLowerCase()}`)
      .slice(0, 5)
      .join(
        '; ',
      )}${(l.ligands?.length ?? 0) > 5 ? `; and ${l.ligands!.length - 5} more` : ''} · ${l.residues?.length ?? 0} contact residues`,
  blockTitle: l =>
    `Open the session on the ${l.name} site (${l.start}–${l.end}), in ${l.pdbIds?.[0]?.toUpperCase() ?? 'a PDB entry'} with it bound`,
}

// The rows a request lane loads, or the lane asking for them. Its name goes
// away with the rows, which would drop keyboard focus on the page, so the
// first row that appears after a click takes it; rows that arrive for a
// chip's or a link's preset move nothing.
function ContactLanes({
  kind,
  state,
  onRequest,
  isFocused,
  toggle,
  pct,
  width,
}: {
  kind: ContactKind
  state: OnRequest
  onRequest: () => void
  isFocused: (r: ProteinRegion) => boolean
  toggle: (focus: Focus) => void
  pct: (residue: number) => string
  width: (start: number, end: number) => string
}) {
  const [asked, setAsked] = useState(false)
  if (state.status !== 'loaded') {
    return (
      <RequestLane
        name={kind.name}
        hint={
          state.status === 'error'
            ? 'PDBe did not answer; click to try again'
            : kind.hint
        }
        busy={state.status === 'loading'}
        note={
          state.status === 'loading' ? (
            'Reading PDBe…'
          ) : state.status === 'error' ? (
            <span className="pm-track-error">{state.message}</span>
          ) : undefined
        }
        onClick={() => {
          if (state.status !== 'loading') {
            setAsked(true)
            onRequest()
          }
        }}
      />
    )
  }
  return state.regions.length === 0 ? (
    <div className="pm-lane">
      <span className="pm-lane-name">{kind.name}</span>
      <div className="pm-track">
        <span className="pm-track-note">{kind.none}</span>
      </div>
    </div>
  ) : (
    state.regions.map((r, i) => (
      <div
        className="pm-lane pm-lane-thin"
        key={`${r.accession}-${r.name}`}
      >
        <span
          className="pm-lane-name pm-partner"
          title={kind.laneTitle(r)}
        >
          {r.name}
        </span>
        <div className="pm-track">
          <button
            type="button"
            autoFocus={i === 0 && asked}
            className={isFocused(r) ? 'pm-interface selected' : 'pm-interface'}
            title={kind.blockTitle(r)}
            aria-pressed={isFocused(r)}
            onClick={() => {
              toggle({ kind: 'region', region: r })
            }}
          >
            {residueRuns(r.residues ?? []).map(run => (
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
    ))
  )
}

export default function ProteinMap({
  accession,
  length,
  regions,
  partners,
  onLoadPartners,
  ligands,
  onLoadLigands,
  focus,
  onFocus,
}: {
  // the UniProt entry the map is drawn from
  accession: string
  // residues in the canonical sequence
  length: number
  // InterPro domains, repeats and sites
  regions: ProteinRegion[]
  partners: OnRequest
  onLoadPartners: () => void
  ligands: OnRequest
  onLoadLigands: () => void
  focus: Focus | undefined
  onFocus: (focus: Focus | undefined) => void
}) {
  const [showSites, setShowSites] = useState(false)
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

  const block = (
    region: ProteinRegion,
    style: CSSProperties,
    autoFocus?: boolean,
  ) => (
    <button
      type="button"
      key={`${region.accession}-${region.start}-${region.end}`}
      autoFocus={autoFocus}
      className={isFocused(region) ? 'pm-block selected' : 'pm-block'}
      style={style}
      title={`${region.name} · ${region.start}–${region.end}${region.pfam ? ` · ${region.pfam}` : ''} — open the session on this`}
      aria-pressed={isFocused(region)}
      onClick={() => {
        toggle({ kind: 'region', region })
      }}
    >
      {(region.end - region.start + 1) / length >= MIN_LABELLED && (
        <span className="pm-block-label">{region.name}</span>
      )}
    </button>
  )

  const step = tickStep(length)
  // the end tick names the length, so a regular tick close to it is dropped
  const ticks = Array.from(
    { length: Math.floor(length / step) },
    (_, i) => (i + 1) * step,
  ).filter(t => t <= length - step / 2)

  return (
    <div className="pm">
      <div className="pm-lanes">
        <div className="pm-lane pm-ruler">
          <a
            className="pm-lane-name pm-accession"
            href={`https://www.uniprot.org/uniprotkb/${accession}/entry`}
            title="UniProt entry"
            target="_blank"
            rel="noreferrer"
          >
            {accession}
          </a>
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
          (showSites ? (
            packLanes(sites).map((lane, i) => (
              <div
                className="pm-lane pm-lane-thin"
                key={`sites-${i}`}
              >
                <span className="pm-lane-name">{i === 0 ? 'Sites' : ''}</span>
                <div className="pm-track">
                  {lane.map((r, j) =>
                    block(
                      r,
                      {
                        left: pct(r.start),
                        width: width(r.start, r.end),
                        background: colors.get(r.accession ?? r.name),
                      },
                      i === 0 && j === 0,
                    ),
                  )}
                </div>
              </div>
            ))
          ) : (
            <RequestLane
              name="Sites"
              hint={`${sites.length} active, binding and conserved sites from InterPro`}
              onClick={() => {
                setShowSites(true)
              }}
            />
          ))}

        <ContactLanes
          kind={PARTNERS}
          state={partners}
          onRequest={onLoadPartners}
          isFocused={isFocused}
          toggle={toggle}
          pct={pct}
          width={width}
        />
        <ContactLanes
          kind={LIGANDS}
          state={ligands}
          onRequest={onLoadLigands}
          isFocused={isFocused}
          toggle={toggle}
          pct={pct}
          width={width}
        />

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
    </div>
  )
}
