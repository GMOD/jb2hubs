import { useMemo, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { errorText } from './ErrorMessage.tsx'
import OpenInDesktop from './OpenInDesktop.tsx'
import {
  type GeneStructure,
  type Isoform,
  canonicalSequence,
  fetchProteinSequence,
} from './geneStructure.ts'
import {
  type Focus,
  focusLabel,
  focusRanges,
  parseResidue,
  translationRanges,
} from './proteinFeatures.ts'
import { type StructureSource, buildSessionUrl } from './proteinSession.ts'
import {
  type AlphaFoldModel,
  fetchPdbEntries,
  pickAlphaFoldModel,
} from './structureSources.ts'

import type { LoadedAlignment } from './proteinAlignments.ts'

// How many experimental entries to offer. TP53 has 322; past the first few the
// coverage is a peptide, and the reader who wants a specific entry has the PDB.
const MAX_EXPERIMENTAL = 6

function isoformLabel(iso: Isoform) {
  return `${iso.transcript.name} · ${iso.aaLength} aa${iso.tag ? ` · ${iso.tag}` : ''}`
}

// The launch, and what the page is for — so it leads, and carries one primary
// action. Everything the session can vary on is decided here: which isoform's
// exons, which structure (the AlphaFold model, a PDB entry, or the complex a
// focused partner was seen in), and what to open on. It says nothing when the
// launch is the expected one: a row appears only where there is a choice, and a
// caption only where the session will differ from what the row reads.
export default function ProteinLaunchCard({
  structure,
  isoform,
  onIsoform,
  alignment,
  aligning,
  alignmentError,
  onRetryAlignment,
  focus,
  partnerPending,
  focusPending,
  onFocus,
  proteinLength,
  structurePick,
  onStructure,
}: {
  structure: GeneStructure
  // the isoform whose exons the session opens on, unless the alignment pins
  // the transcript its query row translates
  isoform: Isoform
  onIsoform: (name: string) => void
  alignment: LoadedAlignment | undefined
  // the alignment the session carries is still loading, and it can pin the
  // transcript, so a launch now would open without it or on another isoform
  aligning: boolean
  alignmentError: unknown
  // re-runs the failed load: its SWR key does not change on a retry
  onRetryAlignment: () => void
  // what the session opens on, from the map or the residue box
  focus: Focus | undefined
  // a partner or ligand the link or chip names is still being read from
  // PDBe, and it decides both the focus and the complex the session opens
  partnerPending: boolean
  // the chip's or link's focus is still being resolved against the map
  focusPending: boolean
  // sets what the session opens on; undefined clears it
  onFocus: (focus: Focus | undefined) => void
  // residues the map is numbered on, when there is a map
  proteinLength?: number
  // the structure the link the reader arrived by named
  structurePick?: string
  onStructure: (id: string) => void
}) {
  const { uniprotId, isoforms } = structure
  // undefined is "whatever is best": the AlphaFold model, else the
  // best-covering experimental entry once those have loaded
  const [choice, setChoice] = useState(structurePick)
  // what the map's regions and a typed residue are numbered on
  const canonical = canonicalSequence(structure)

  const isDefaultIsoform = isoform.transcript.name === structure.transcript.name
  const pinned = alignment?.structureOverrides
  const {
    data: fetchedTranslation,
    error: translationError,
    isLoading: translating,
    mutate: retryTranslation,
  } = useSWRImmutable(
    isDefaultIsoform || pinned
      ? null
      : (['protein-seq', isoform.protein] as const),
    ([, protein]) => fetchProteinSequence(protein),
    LIVE_QUERY,
  )
  const { data: experimental, isLoading: listing } = useSWRImmutable(
    uniprotId ? (['experimental-structures', uniprotId] as const) : null,
    ([, id]) => fetchPdbEntries(id),
    LIVE_QUERY,
  )
  // Memoised, because `launched` keys the url's memo below. Every input is
  // state, a prop, or SWR data, all of which hold their identity between
  // renders.
  const pick = useMemo(() => {
    // The 100-way carries its own transcript and query protein; swapping them
    // in here is what keeps the launched session's three views on one
    // coordinate space, rather than pairing that alignment with a different
    // isoform.
    const launched: GeneStructure = {
      ...structure,
      transcript: isoform.transcript,
      proteinSequence: isDefaultIsoform
        ? structure.proteinSequence
        : fetchedTranslation,
      ...pinned,
    }
    const model = pickAlphaFoldModel(
      structure.alphafold,
      launched.proteinSequence,
    )
    // The best-covering few, and the entry a chip or a link names wherever
    // it ranks: TP53's 3KMD, the core on DNA, is 218th of 323 by coverage.
    const listed = experimental ?? []
    const shown = [
      ...listed.slice(0, MAX_EXPERIMENTAL),
      ...listed.slice(MAX_EXPERIMENTAL).filter(e => e.pdbId === choice),
    ]
    // A focused partner or ligand site brings the PDB entries the protein was
    // seen in with it, and the first of those is the structure to open with
    // unless the reader has picked one: the point of the focus is the complex.
    const complexIds =
      focus?.kind === 'region' &&
      (focus.region.kind === 'interface' || focus.region.kind === 'ligand')
        ? (focus.region.pdbIds ?? [])
        : []
    // A pick from the complexes goes when the focus that offered it does.
    const offered =
      choice === 'none' ||
      (choice === 'alphafold' && !!model) ||
      shown.some(e => e.pdbId === choice) ||
      complexIds.some(id => id === choice)
    const chosen =
      (offered ? choice : undefined) ??
      complexIds[0] ??
      (model ? 'alphafold' : (shown[0]?.pdbId ?? 'none'))
    const primary: StructureSource | undefined =
      chosen === 'alphafold' && model
        ? { url: model.url }
        : shown.some(e => e.pdbId === chosen) || complexIds.includes(chosen)
          ? { pdbId: chosen }
          : undefined
    const ranges = focus ? focusRanges(focus) : undefined
    return {
      launched,
      model,
      shown,
      complexIds,
      chosen,
      primary,
      ranges,
      offered,
    }
  }, [
    structure,
    isoform,
    isDefaultIsoform,
    fetchedTranslation,
    pinned,
    choice,
    experimental,
    focus,
  ])
  const {
    launched,
    model,
    shown,
    complexIds,
    chosen,
    primary,
    ranges,
    offered,
  } = pick
  // a linked PDB entry is not on offer until the entries have loaded, nor a
  // linked complex until the partner that names it has
  const structurePending = partnerPending || (!!choice && !offered && listing)

  // Memoised apart from the url: carrying a focus onto another isoform runs
  // an alignment, which a change of alignment has no reason to repeat. A focus
  // is numbered on the canonical, as the map's regions and a typed residue
  // are; the plugin lights residues of the launched translation, and carries
  // them onto the structure itself.
  const translation = launched.proteinSequence
  const { placement, selection } = useMemo(() => {
    const placed =
      ranges && translation && canonical
        ? translationRanges(ranges, canonical, translation)
        : undefined
    const placement = !translation
      ? undefined
      : !placed
        ? 'approximate'
        : JSON.stringify(placed) === JSON.stringify(ranges)
          ? 'exact'
          : 'aligned'
    return { placement, selection: placed ?? ranges }
  }, [ranges, canonical, translation])
  // A focus outside the chosen PDB entry's UniProt span lights nothing.
  const entry = shown.find(e => e.pdbId === chosen)
  const outsideEntry =
    !!entry &&
    !!ranges &&
    !ranges.some(r => r.start <= entry.end && r.end >= entry.start)

  // Building the url deflates the whole inline alignment, so it is memoised on
  // its own.
  const { url } = useMemo(() => {
    const modelExact =
      chosen === 'alphafold' &&
      !!model &&
      model.sequence === launched.proteinSequence
    return buildSessionUrl({
      structure: launched,
      primary,
      initialTranscriptResidues: selection,
      flip: launched.transcript.strand === -1,
      msa: alignment?.source,
      quiet: true,
      // an identity alignment is a wall of matches with nothing to read
      showAlignment: !modelExact,
      colorByConfidence: chosen === 'alphafold',
    })
  }, [launched, model, chosen, primary, selection, alignment])
  const { transcript } = launched

  // The structure view is omitted when there is no translation to align it to,
  // whatever structure was picked.
  const noTranslation = !!primary && !launched.proteinSequence && !translating
  // Said only when the focus will not light as the chip reads: lit on load in
  // all three views is the expected case and goes unsaid.
  const focusCaveat = !primary
    ? 'needs a structure'
    : !placement
      ? "needs the isoform's translation"
      : selection?.length === 0
        ? `not on ${transcript.name}, which lacks these residues`
        : outsideEntry
          ? `not in this entry, which covers ${entry.start}–${entry.end}`
          : placement === 'approximate'
            ? `approximate: ${transcript.name} was not aligned to the canonical isoform the map counts on`
            : placement === 'aligned'
              ? `carried onto ${transcript.name} by alignment`
              : undefined

  return (
    <div className="msv-result">
      <h2>
        {transcript.geneName}{' '}
        {isoforms.length > 1 ? null : (
          <span className="msv-sub">{transcript.name}</span>
        )}
      </h2>
      <p className="msv-meta">
        {launched.target.assemblyName} ·{' '}
        {launched.target.canonicalRefName(transcript.refName)}{' '}
        {transcript.strand === 1 ? '+' : '−'}
      </p>

      <div className="msv-controls">
        {isoforms.length > 1 && (
          <label className="msv-control">
            <span className="msv-control-label">Isoform</span>
            <select
              className="ui-select"
              value={isoform.transcript.name}
              onChange={e => {
                onIsoform(e.target.value)
              }}
            >
              {isoforms.map(iso => (
                <option
                  key={iso.transcript.name}
                  value={iso.transcript.name}
                >
                  {isoformLabel(iso)}
                </option>
              ))}
            </select>
          </label>
        )}

        {uniprotId && (
          <label className="msv-control">
            <span className="msv-control-label">Structure</span>
            <select
              className="ui-select"
              value={chosen}
              onChange={e => {
                setChoice(e.target.value)
                onStructure(e.target.value)
              }}
            >
              {model && (
                <option value="alphafold">
                  AlphaFold · {model.sequence.length} aa · pLDDT{' '}
                  {model.plddt.toFixed(0)}
                </option>
              )}
              {shown.map(e => (
                <option
                  key={e.pdbId}
                  value={e.pdbId}
                >
                  PDB {e.pdbId.toUpperCase()} · {e.start}–{e.end}
                  {e.resolution ? ` · ${e.resolution.toFixed(1)} Å` : ''}
                </option>
              ))}
              {focus?.kind === 'region' && complexIds.length > 0 && (
                <optgroup
                  label={
                    focus.region.kind === 'ligand'
                      ? `With ${focus.region.name} bound`
                      : `In complex with ${focus.region.name}`
                  }
                >
                  {complexIds
                    .filter(id => !shown.some(e => e.pdbId === id))
                    .map(id => (
                      <option
                        key={id}
                        value={id}
                      >
                        PDB {id.toUpperCase()} · with {focus.region.name}
                      </option>
                    ))}
                </optgroup>
              )}
              <option value="none">No structure</option>
            </select>
            <StructureLink
              uniprotId={uniprotId}
              model={chosen === 'alphafold' ? model : undefined}
              pdbId={chosen !== 'alphafold' && primary ? chosen : undefined}
            />
          </label>
        )}
        {uniprotId && !model && structure.alphafold.length === 0 && (
          <p className="ui-note">
            AlphaFold DB has no model for {uniprotId}
            {shown.length > 0 ? '; the PDB entries above stand in.' : '.'}
          </p>
        )}
        {!uniprotId && (
          <p className="ui-note">
            No UniProt entry for {transcript.geneName}, so no structure to open.
          </p>
        )}
        {noTranslation && (
          <p className="ui-error">
            The translation of {isoform.protein} could not be fetched
            {translationError ? ` (${errorText(translationError)})` : ''}, so
            the structure is not opened: the 3D view aligns it to that sequence.{' '}
            {isDefaultIsoform ? null : (
              <button
                className="ui-linkbtn"
                onClick={() => {
                  void retryTranslation()
                }}
              >
                Try again
              </button>
            )}
          </p>
        )}

        {focus ? (
          <div className="msv-control">
            <span className="msv-control-label">Opens on</span>
            <span className="msv-chips">
              <button
                className="ui-chip-btn"
                title="Selected in all three views when the session opens; click to clear"
                onClick={() => {
                  onFocus(undefined)
                }}
              >
                {focusLabel(focus)} ×
              </button>
            </span>
            {focusCaveat && <span className="ui-caption">{focusCaveat}</span>}
          </div>
        ) : proteinLength && !focusPending ? (
          <ResidueForm
            sequence={canonical}
            length={proteinLength}
            onFocus={onFocus}
          />
        ) : null}
      </div>

      <div className="msv-actions">
        {translating || structurePending || aligning ? (
          <span className="msv-open msv-open-disabled">
            {translating
              ? 'Resolving isoform…'
              : structurePending
                ? 'Resolving structure…'
                : 'Loading alignment…'}
          </span>
        ) : (
          <>
            <a
              className="msv-open"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={
                alignment &&
                `With ${alignment.carries}${alignment.note ? `. ${alignment.note}` : ''}`
              }
            >
              Open in JBrowse ↗
            </a>
            <OpenInDesktop
              className="msv-open-desktop"
              webUrl={url}
            />
          </>
        )}
      </div>
      {!aligning && alignmentError ? (
        <p className="ui-error">
          No alignment for the session: {errorText(alignmentError)}{' '}
          <button
            className="ui-linkbtn"
            onClick={() => {
              onRetryAlignment()
            }}
          >
            Try again
          </button>
        </p>
      ) : null}
    </div>
  )
}

// Where to read about the structure the session will open.
function StructureLink({
  uniprotId,
  model,
  pdbId,
}: {
  uniprotId: string
  model: AlphaFoldModel | undefined
  pdbId: string | undefined
}) {
  const href = model
    ? `https://alphafold.ebi.ac.uk/entry/${model.entity}`
    : pdbId
      ? `https://www.ebi.ac.uk/pdbe/entry/pdb/${pdbId}`
      : `https://www.uniprot.org/uniprotkb/${uniprotId}/entry`
  return (
    <a
      className="ui-caption"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {model ? 'AlphaFold DB' : pdbId ? 'PDBe' : 'UniProt'} ↗
    </a>
  )
}

// The residue to open on, typed against the canonical, while nothing is
// focused. The box's state lives here, so it goes when a focus replaces the
// form, and an uncontrolled input keeps what was typed through an error.
function ResidueForm({
  sequence,
  length,
  onFocus,
}: {
  sequence: string | undefined
  length: number
  onFocus: (focus: Focus) => void
}) {
  const [error, setError] = useState<string>()
  const middle = Math.ceil(length / 2)
  return (
    <form
      className="msv-control"
      onSubmit={e => {
        e.preventDefault()
        const typed = String(new FormData(e.currentTarget).get('residue') ?? '')
        const parsed = parseResidue(typed, sequence, length)
        if ('error' in parsed) {
          setError(parsed.error)
        } else {
          onFocus({ kind: 'residue', ...parsed })
        }
      }}
    >
      <span className="msv-control-label">Opens on</span>
      <input
        name="residue"
        className="ui-input msv-residue"
        aria-label="Residue to open on"
        placeholder={
          sequence
            ? `residue 1–${length} or ${sequence[middle - 1]}${middle}`
            : `residue 1–${length}`
        }
        aria-invalid={!!error}
        onChange={() => {
          setError(undefined)
        }}
      />
      <button
        type="submit"
        className="ui-btn-secondary"
      >
        Focus
      </button>
      {error && (
        <span
          className="ui-error"
          role="alert"
        >
          {error}
        </span>
      )}
    </form>
  )
}
