import { useState } from 'react'

import { fetchExperimentalStructures, pickAlphaFoldModel } from 'p2s_mapper'
import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { errorText } from './ErrorMessage.tsx'
import OpenInDesktop from './OpenInDesktop.tsx'
import { type GeneStructure, canonicalSequence } from './geneStructure.ts'
import { type LoadedAlignment, markFocus } from './proteinAlignments.ts'
import {
  type Focus,
  focusLabel,
  focusRanges,
  parseResidue,
  translationRanges,
} from './proteinFeatures.ts'
import { type StructureSource, buildSessionUrl } from './proteinSession.ts'

const PDB_ID = /^\d\w{3}$/

// The launch, and what the page is for. The session decides everything itself:
// the gene's own transcript, and as structure the entry a chip names, else the
// complex a focused partner or ligand was seen in, else the AlphaFold model,
// else the best-covering experimental entry. The one choice left to the reader
// is what it opens on.
export default function ProteinLaunchCard({
  structure,
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
}: {
  structure: GeneStructure
  alignment: LoadedAlignment | undefined
  // the alignment can pin the transcript, so a launch now would open without
  // it or on another isoform
  aligning: boolean
  alignmentError: unknown
  // re-runs the failed load: its SWR key does not change on a retry
  onRetryAlignment: () => void
  focus: Focus | undefined
  // a partner or ligand the link names is still being read from PDBe, and it
  // decides the complex the session opens
  partnerPending: boolean
  focusPending: boolean
  onFocus: (focus: Focus | undefined) => void
  // residues the map is numbered on, when there is a map
  proteinLength?: number
  // the PDB entry the chip or link names, while its own focus holds
  structurePick?: string
}) {
  const { uniprotId } = structure
  const canonical = canonicalSequence(structure)
  // The 100-way carries its own transcript and query protein; swapping them in
  // keeps the session's three views on one coordinate space.
  const launched: GeneStructure = {
    ...structure,
    ...alignment?.structureOverrides,
  }
  const translation = launched.proteinSequence
  const model = pickAlphaFoldModel(
    structure.alphafold,
    translation ? { translation: { seq: translation } } : undefined,
  )
  const complexIds =
    focus?.kind === 'region' &&
    (focus.region.kind === 'interface' || focus.region.kind === 'ligand')
      ? (focus.region.pdbIds ?? [])
      : []
  const pdbId =
    complexIds[0] ??
    (structurePick && PDB_ID.test(structurePick) ? structurePick : undefined)
  const { data: experimental, isLoading: listing } = useSWRImmutable(
    uniprotId && !pdbId && !model
      ? (['experimental-structures', uniprotId] as const)
      : null,
    ([, id]) => fetchExperimentalStructures(id),
    LIVE_QUERY,
  )
  const fallbackPdb = experimental?.[0]?.pdbId
  const primary: StructureSource | undefined = pdbId
    ? { pdbId }
    : model && uniprotId
      ? { uniprotId }
      : fallbackPdb
        ? { pdbId: fallbackPdb }
        : undefined
  const predicted = pdbId ? undefined : model

  // A focus is numbered on the canonical, as the map's regions and a typed
  // residue are; the plugin lights residues of the launched translation.
  const ranges = focus ? focusRanges(focus) : undefined
  const selection =
    (ranges && translation && canonical
      ? translationRanges(ranges, canonical, translation)
      : undefined) ?? ranges
  const { url } = buildSessionUrl({
    structure: launched,
    primary,
    initialTranscriptResidues: selection,
    msa: markFocus(alignment?.source, focus, selection),
    // an identity alignment is a wall of matches with nothing to read
    showAlignment: predicted?.sequence !== translation,
    colorScheme: predicted ? 'plddt-confidence' : undefined,
  })
  const { transcript } = launched
  const pending = partnerPending || listing || aligning

  return (
    <div className="msv-result">
      <h2>
        {transcript.geneName} <span className="msv-sub">{transcript.name}</span>
      </h2>

      {focus ? (
        <div className="msv-control">
          <span className="msv-control-label">Opens on</span>
          <button
            className="ui-chip-btn"
            title="Selected in all three views when the session opens; click to clear"
            onClick={() => {
              onFocus(undefined)
            }}
          >
            {focusLabel(focus)} ×
          </button>
        </div>
      ) : proteinLength && !focusPending ? (
        <ResidueForm
          sequence={canonical}
          length={proteinLength}
          onFocus={onFocus}
        />
      ) : null}

      <div className="msv-actions">
        {pending ? (
          <span className="msv-open msv-open-disabled">Loading…</span>
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
