import { useState } from 'react'

import { fetchExperimentalStructures, pickAlphaFoldModel } from 'p2s_mapper'
import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { errorText } from './ErrorMessage.tsx'
import OpenInDesktop from './OpenInDesktop.tsx'
import { type GeneStructure, canonicalSequence } from './geneStructure.ts'
import { geneUrl } from './orthologSearchUtils.ts'
import { type LoadedAlignment, markFocus } from './proteinAlignments.ts'
import {
  type Focus,
  focusLabel,
  focusRanges,
  parseResidue,
  translationRanges,
} from './proteinFeatures.ts'
import {
  STRUCTURE_COLORS,
  type StructureColor,
  type StructureSource,
  buildSessionUrl,
} from './proteinSession.ts'

const PDB_ID = /^\d\w{3}$/

// TP53 has 322 entries; past the first few the coverage is a peptide.
const MAX_EXPERIMENTAL = 6

const HUMAN = 9606

type ColorChoice = StructureColor | 'default'

const COLOR_LABELS: Record<ColorChoice, string> = {
  default: 'Chain and element',
  'plddt-confidence': 'AlphaFold confidence (pLDDT)',
  alphamissense: 'AlphaMissense pathogenicity',
  clinvar: 'ClinVar pathogenic variants',
}

// pLDDT is a predicted model's own; AlphaMissense and ClinVar cover the human
// proteome only.
function colorsFor(predicted: boolean, taxId: number): ColorChoice[] {
  return [
    'default',
    ...STRUCTURE_COLORS.filter(c =>
      c === 'plddt-confidence' ? predicted : taxId === HUMAN,
    ),
  ]
}

// The launch, and what the page is for. Unless the reader picks one in
// Advanced, the structure is the entry a chip or link names, else the complex a
// focused partner or ligand was seen in, else the AlphaFold model, else the
// best-covering experimental entry.
export default function ProteinLaunchCard({
  structure,
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
}: {
  structure: GeneStructure
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
}) {
  const { uniprotId, taxId } = structure
  const [colorChoice, setColorChoice] = useState<string>()
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
  const picked =
    structureChoice === 'none' ||
    (structureChoice === 'alphafold' && model) ||
    (structureChoice && PDB_ID.test(structureChoice))
      ? structureChoice
      : undefined
  const needsList = !picked && !complexIds[0] && !model
  const { data: experimental, isLoading: listing } = useSWRImmutable(
    uniprotId && (advanced || needsList)
      ? (['experimental-structures', uniprotId] as const)
      : null,
    ([, id]) => fetchExperimentalStructures(id),
    LIVE_QUERY,
  )
  const chosen =
    picked ??
    complexIds[0] ??
    (model ? 'alphafold' : (experimental?.[0]?.pdbId ?? 'none'))
  const primary: StructureSource | undefined =
    chosen === 'none'
      ? undefined
      : chosen === 'alphafold'
        ? uniprotId
          ? { uniprotId }
          : undefined
        : { pdbId: chosen }
  const predicted = chosen === 'alphafold'
  const colors = colorsFor(predicted, taxId)
  const color =
    colors.find(c => c === colorChoice) ??
    (predicted ? 'plddt-confidence' : 'default')

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
    showAlignment: !(predicted && model?.sequence === translation),
    colorScheme: color === 'default' ? undefined : color,
  })
  const { transcript } = launched
  const pending = focusPending || (needsList && listing) || aligning

  const listed = experimental?.slice(0, MAX_EXPERIMENTAL) ?? []
  const extra = [...complexIds, chosen].filter(
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
              <span className="msv-control-label">Colour</span>
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
        {pending ? (
          <span className="msv-open msv-open-disabled">Loading…</span>
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
          <button
            className="ui-chip-btn"
            title="Selected in all three views when the session opens; click to clear"
            onClick={() => {
              onFocus(undefined)
            }}
          >
            {focusLabel(focus)} ×
          </button>
        )}
        {advanced && !pending && (
          <OpenInDesktop
            className="msv-open-desktop"
            webUrl={url}
          />
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
