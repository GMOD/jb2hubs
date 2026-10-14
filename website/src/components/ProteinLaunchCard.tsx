import { useState } from 'react'

import { fetchExperimentalStructures } from 'p2s_mapper'
import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { errorText } from './ErrorMessage.tsx'
import ErrorWithRetry from './ErrorWithRetry.tsx'
import OpenInDesktop from './OpenInDesktop.tsx'
import { type EditConsequence, editOpens } from './editConsequence.ts'
import { type GeneStructure, canonicalSequence } from './geneStructure.ts'
import { geneUrl } from './orthologSearchUtils.ts'
import { type LoadedAlignment } from './proteinAlignments.ts'
import { type Focus, focusLabel, parseResidue } from './proteinFeatures.ts'
import { complexIdsOf, launchModel, launchPlan } from './proteinLaunch.ts'
import {
  COLOR_LABELS,
  HUMAN,
  PDB_ID,
  chooseStructure,
} from './proteinSession.ts'

// TP53 has 322 entries; past the first few the coverage is a peptide.
const MAX_EXPERIMENTAL = 6

// The launch, and what the page is for. Unless the reader picks one in
// Advanced, the structure is the entry a chip or link names, else the complex a
// focused partner or ligand was seen in, else the AlphaFold model, else the
// best-covering experimental entry.
export default function ProteinLaunchCard({
  structure,
  launched,
  advanced,
  alignment,
  aligning,
  alignmentError,
  onRetryAlignment,
  focus,
  focusPending,
  onFocus,
  proteinLength,
  structureChoice,
  onStructure,
  residueEntry,
  consequence,
}: {
  structure: GeneStructure
  // the structure with the alignment's transcript and translation swapped in,
  // so the session's three views share one coordinate space
  launched: GeneStructure
  advanced: boolean
  alignment: LoadedAlignment | undefined
  // the alignment can pin the transcript, so a launch now would open without
  // it or on another isoform
  aligning: boolean
  alignmentError: unknown
  onRetryAlignment: () => void
  focus: Focus | undefined
  // a preset focus is still resolving, and a partner's decides the complex
  focusPending: boolean
  onFocus: (focus: Focus | undefined) => void
  // residues the map is numbered on, when there is a map
  proteinLength?: number
  // `alphafold`, `none` or a PDB id: picked in Advanced, or named by the chip
  // or link while its focus holds
  structureChoice?: string
  onStructure: (choice: string) => void
  // the entry a focused residue is seen touching something in
  residueEntry?: string
  // the edit the focus carries, counted on the launched translation
  consequence?: EditConsequence
}) {
  const { uniprotId, taxId } = structure
  const [colorChoice, setColorChoice] = useState<string>()
  const canonical = canonicalSequence(structure)
  const { needsList } = chooseStructure({
    pick: structureChoice,
    complexId: complexIdsOf(focus)[0],
    residueEntry,
    hasModel: !!launchModel(structure, launched),
  })
  const listNeeded = advanced || needsList
  const {
    data: experimental,
    error: listError,
    isLoading: listing,
    mutate: retryList,
  } = useSWRImmutable(
    uniprotId && listNeeded
      ? (['experimental-structures', uniprotId] as const)
      : null,
    ([, id]) => fetchExperimentalStructures(id),
    LIVE_QUERY,
  )
  const {
    model,
    complexIds,
    chosen,
    primary,
    colors,
    color,
    residueSelection,
    url,
  } = launchPlan({
    structure,
    launched,
    alignment,
    focus,
    structureChoice,
    residueEntry,
    bestEntry: experimental?.[0]?.pdbId,
    consequence,
    colorChoice,
  })
  const unplaced = !!focus && !residueSelection
  const absent = !!focus && residueSelection?.length === 0
  const { transcript } = launched
  const listFailed = needsList && !!listError
  const pending = focusPending || (needsList && listing) || aligning

  const listed = experimental?.slice(0, MAX_EXPERIMENTAL) ?? []
  const extra = [...complexIds, residueEntry ?? '', chosen].filter(
    (id, i, all) =>
      PDB_ID.test(id) &&
      all.indexOf(id) === i &&
      !listed.some(e => e.pdbId === id),
  )
  const sub = [
    taxId === HUMAN ? undefined : structure.organism,
    advanced ? transcript.name : undefined,
  ].filter(Boolean)

  return (
    <div className="msv-result">
      <h2>
        <a
          href={geneUrl('/gene/', structure.symbol, taxId)}
          title="Gene page: orthologs and conserved gene order"
        >
          {transcript.geneName}
        </a>{' '}
        <span className="msv-sub">
          {sub.join(' · ')}
          {advanced && uniprotId ? (
            <>
              {sub.length ? ' · ' : ''}
              <a
                href={`https://www.uniprot.org/uniprotkb/${uniprotId}/entry`}
                target="_blank"
                rel="noreferrer"
              >
                {uniprotId}
              </a>
            </>
          ) : null}
        </span>
      </h2>

      {advanced && (
        <div className="msv-advanced">
          {uniprotId && (
            <label className="msv-control">
              <span className="msv-control-label">Structure</span>
              <select
                className="ui-select"
                value={chosen}
                onChange={e => {
                  onStructure(e.target.value)
                }}
              >
                {model && (
                  <option value="alphafold">
                    AlphaFold · {model.sequence.length} aa
                    {model.meanPlddt === undefined
                      ? ''
                      : ` · pLDDT ${model.meanPlddt.toFixed(0)}`}
                  </option>
                )}
                {listed.map(e => (
                  <option
                    key={e.pdbId}
                    value={e.pdbId}
                  >
                    PDB {e.pdbId.toUpperCase()} · {e.start}–{e.end}
                    {e.resolution ? ` · ${e.resolution.toFixed(1)} Å` : ''}
                  </option>
                ))}
                {extra.map(id => (
                  <option
                    key={id}
                    value={id}
                  >
                    PDB {id.toUpperCase()}
                    {complexIds.includes(id) && focus?.kind === 'region'
                      ? ` · with ${focus.region.name}`
                      : ''}
                  </option>
                ))}
                <option value="none">No structure</option>
              </select>
            </label>
          )}
          {primary && (
            <label className="msv-control">
              <span className="msv-control-label">Color</span>
              <select
                className="ui-select"
                value={color}
                onChange={e => {
                  setColorChoice(e.target.value)
                }}
              >
                {colors.map(c => (
                  <option
                    key={c}
                    value={c}
                  >
                    {COLOR_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!focus && proteinLength && !focusPending ? (
            <ResidueForm
              sequence={canonical}
              length={proteinLength}
              onFocus={onFocus}
            />
          ) : null}
        </div>
      )}

      <div className="msv-actions">
        {pending || listFailed ? (
          <span className="msv-open msv-open-disabled">
            {pending ? 'Loading…' : 'Open in JBrowse ↗'}
          </span>
        ) : (
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
        )}
        {focus && (
          <span
            className="msv-focus"
            title={
              unplaced
                ? 'The canonical and this transcript are too long to align, so the focus is not carried onto it'
                : absent
                  ? `${launched.transcript.name} encodes another isoform than UniProt's canonical, without these residues`
                  : 'Selected in the genome view, the structure and the alignment'
            }
          >
            {unplaced
              ? `${focusLabel(focus)} is not placed on this transcript`
              : absent
                ? `${focusLabel(focus)} is not on this transcript's protein`
                : consequence
                  ? `Opens on ${editOpens(consequence, focusLabel(focus))}`
                  : `Opens at ${focusLabel(focus)}`}{' '}
            ·{' '}
            <button
              className="ui-linkbtn"
              onClick={() => {
                onFocus(undefined)
              }}
            >
              Clear
            </button>
          </span>
        )}
        {advanced && !pending && !listFailed && (
          <OpenInDesktop
            className="msv-open-desktop"
            webUrl={url}
          />
        )}
      </div>
      {listNeeded && (
        <ErrorWithRetry
          error={listError}
          onRetry={() => {
            void retryList()
          }}
          className="ui-error"
          context="The structure list did not load"
        />
      )}
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
      <span className="msv-control-label">Residue</span>
      <input
        name="residue"
        className="ui-input msv-residue"
        aria-label="Residue to open on"
        placeholder={
          sequence
            ? `1–${length} or ${sequence[middle - 1]}${middle}`
            : `1–${length}`
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
