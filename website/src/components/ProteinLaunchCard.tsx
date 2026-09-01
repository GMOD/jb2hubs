import { useMemo, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { errorText } from './ErrorMessage.tsx'
import { SessionDetailsDialog } from './ProteinBrowserDialogs.tsx'
import {
  type GeneStructure,
  type Isoform,
  fetchProteinSequence,
  geneStats,
} from './geneStructure.ts'
import { type StructureSource, buildSessionUrl } from './proteinSession.ts'
import {
  type AlphaFoldModel,
  fetchAlphaFoldModels,
  fetchExperimentalStructures,
  pickAlphaFoldModel,
} from './structureSources.ts'

import type { LoadedAlignment } from './ProteinAlignmentSection.tsx'
import type { Domain, ProteinPanelRow } from './proteinMsa.ts'

// How many experimental entries to offer. TP53 has 322; past the first few the
// coverage is a peptide, and the reader who wants a specific entry has the PDB.
const MAX_EXPERIMENTAL = 6

// Joins a short list into prose: "a", "a and b", "a, b and c".
function joinList(parts: string[]) {
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
    : (parts[0] ?? '')
}

function isoformLabel(iso: Isoform) {
  return `${iso.transcript.name} · ${iso.aaLength} aa${iso.tag ? ` · ${iso.tag}` : ''}`
}

// An ortholog's best AlphaFold model, resolved through the API so a species
// whose canonical is past the length cap still gets its isoform model. Memoized
// per accession: the SWR key below is the whole list of marked rows, so without
// this every toggle re-asked the API for every accession already resolved.
const modelByAccession = new Map<string, Promise<AlphaFoldModel | undefined>>()

function superposedModel(accession: string) {
  let pending = modelByAccession.get(accession)
  if (!pending) {
    pending = fetchAlphaFoldModels(accession).then(models =>
      pickAlphaFoldModel(models),
    )
    modelByAccession.set(accession, pending)
  }
  return pending
}

async function superposedModels(accessions: string[]) {
  return Promise.all(
    accessions.map(async accession => ({
      accession,
      model: await superposedModel(accession),
    })),
  )
}

// The launch, and what the page is for — so it leads, and carries one primary
// action. Everything the session can vary on is decided here: which isoform's
// exons, which structure (the AlphaFold model or a PDB entry), which ortholog
// structures to superpose, whether to land on a domain, and the view options.
export default function ProteinLaunchCard({
  structure,
  alignment,
  superposed,
  onRemoveSuperposed,
  queryRow,
  selectedDomain,
  onClearDomain,
}: {
  structure: GeneStructure
  alignment: LoadedAlignment | undefined
  // ortholog rows the reader asked to superpose, by Swiss-Prot accession
  superposed: ProteinPanelRow[]
  onRemoveSuperposed: (uniprot: string) => void
  // the panel's row for the query gene, whose protein the domains are on
  queryRow: ProteinPanelRow | undefined
  selectedDomain: Domain | undefined
  onClearDomain: () => void
}) {
  const { uniprotId, isoforms } = structure
  const [collapse, setCollapse] = useState(true)
  const [flip, setFlip] = useState(structure.transcript.strand === -1)
  const [variants, setVariants] = useState(true)
  const [isoformName, setIsoformName] = useState(structure.transcript.name)
  // undefined is "whatever is best": the AlphaFold model, else the
  // best-covering experimental entry once those have loaded
  const [choice, setChoice] = useState<string>()
  const [detailsOpen, setDetailsOpen] = useState(false)

  const isoform =
    isoforms.find(i => i.transcript.name === isoformName) ?? isoforms[0]!
  const isDefaultIsoform = isoform.transcript.name === structure.transcript.name
  const {
    data: fetchedTranslation,
    error: translationError,
    isLoading: translating,
    mutate: retryTranslation,
  } = useSWRImmutable(
    isDefaultIsoform ? null : (['protein-seq', isoform.protein] as const),
    ([, protein]) => fetchProteinSequence(protein),
    LIVE_QUERY,
  )
  const { data: experimental } = useSWRImmutable(
    uniprotId ? (['experimental-structures', uniprotId] as const) : null,
    ([, id]) => fetchExperimentalStructures(id),
    LIVE_QUERY,
  )
  const accessions = superposed.flatMap(r => (r.uniprot ? [r.uniprot] : []))
  const { data: extras } = useSWRImmutable(
    accessions.length > 0
      ? (['alphafold-models', ...accessions] as const)
      : null,
    ([, ...ids]) => superposedModels(ids),
    LIVE_QUERY,
  )

  // One memo for everything derived, because building the url deflates the
  // whole inline alignment and the card re-renders on every progress message
  // the live alignment posts. Every input is state, a prop, or SWR data, all of
  // which hold their identity between renders.
  const launch = useMemo(() => {
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
      ...alignment?.structureOverrides,
    }
    const model = pickAlphaFoldModel(
      structure.alphafold,
      launched.proteinSequence,
    )
    const shown = (experimental ?? []).slice(0, MAX_EXPERIMENTAL)
    const chosen = choice ?? (model ? 'alphafold' : (shown[0]?.pdbId ?? 'none'))
    const primary: StructureSource | undefined =
      chosen === 'alphafold' && model
        ? { url: model.url }
        : shown.some(e => e.pdbId === chosen)
          ? { pdbId: chosen }
          : undefined
    const found = (extras ?? []).flatMap(e => (e.model ? [e.model] : []))
    const missingModels = (extras ?? [])
      .filter(e => !e.model)
      .map(e => e.accession)
    // A domain is a range on the query row's protein; the plugin lights
    // structure residues. The two agree when the model was folded from the
    // transcript's own translation and that is the row's protein. A PDB entry
    // numbers its observed chain, and a different isoform shifts the range —
    // either the model's (folded from another isoform) or the row's (the
    // panel's pick is MANE, else the longest, which need not be the launched
    // transcript's protein). The row is matched by accession, and by length
    // where the accession cannot agree: a PANTHER row is a UniProt entry, and
    // the 100-way's transcript has no RefSeq protein to name.
    const modelExact =
      chosen === 'alphafold' &&
      !!model &&
      model.sequence === launched.proteinSequence
    const rowExact =
      !!queryRow &&
      (queryRow.protein === isoform.protein ||
        queryRow.length === launched.proteinSequence?.length)
    const domainExact = modelExact && rowExact
    return {
      launched,
      model,
      shown,
      chosen,
      primary,
      found,
      missingModels,
      modelExact,
      domainExact,
      ...buildSessionUrl({
        structure: launched,
        primary,
        superposed: found.map(m => ({ url: m.url })),
        initialSelection: selectedDomain
          ? { start: selectedDomain.start - 1, end: selectedDomain.end }
          : undefined,
        collapse,
        flip,
        msa: alignment?.source,
        variantTracks: variants,
      }),
    }
  }, [
    structure,
    isoform,
    isDefaultIsoform,
    fetchedTranslation,
    alignment,
    choice,
    experimental,
    extras,
    queryRow,
    selectedDomain,
    collapse,
    flip,
    variants,
  ])
  const {
    launched,
    model,
    shown,
    chosen,
    primary,
    found,
    missingModels,
    modelExact,
    domainExact,
    session,
    url,
    alignmentOmitted,
  } = launch
  const { transcript, assemblyAccession } = launched
  const { codingBp } = geneStats(transcript)

  // What the session actually holds, read off the session: the structure view
  // is omitted when there is no translation to align it to, whatever structure
  // was picked, and the superposed models ride inside it.
  const hasProteinView = session.views.some(v => v.type === 'ProteinView')
  const noTranslation = !!primary && !launched.proteinSequence && !translating
  const carries = [
    collapse ? 'the coding exons back to back' : 'the gene in its genome',
    hasProteinView
      ? chosen === 'alphafold'
        ? 'the AlphaFold structure'
        : `PDB ${chosen.toUpperCase()}`
      : undefined,
    hasProteinView && found.length > 0
      ? `${found.length} superposed ortholog ${found.length === 1 ? 'structure' : 'structures'}`
      : undefined,
    alignment && !alignmentOmitted
      ? `a ${alignment.rowCount}-row alignment`
      : undefined,
    variants && launched.target.variantTrackIds.length > 0
      ? 'variant tracks'
      : undefined,
  ].filter((c): c is string => !!c)

  return (
    <div className="msv-result">
      <h2>
        {transcript.geneName} <span className="msv-sub">{transcript.name}</span>
      </h2>
      <p className="msv-meta">
        {assemblyAccession} · {launched.target.assemblyName} ·{' '}
        {launched.target.canonicalRefName(transcript.refName)}{' '}
        {transcript.strand === 1 ? '+' : '−'} · {transcript.cds.length} coding
        exons · {codingBp.toLocaleString()} bp CDS
      </p>

      <div className="msv-controls">
        {alignment?.structureOverrides ? (
          <div className="msv-control">
            <span className="msv-control-label">Isoform</span>
            <span>
              {transcript.name}{' '}
              <span className="ui-caption">set by the 100-way alignment</span>
            </span>
          </div>
        ) : (
          isoforms.length > 1 && (
            <label className="msv-control">
              <span className="msv-control-label">Isoform</span>
              <select
                className="ui-select"
                value={isoform.transcript.name}
                onChange={e => {
                  setIsoformName(e.target.value)
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
          )
        )}

        {uniprotId && (
          <label className="msv-control">
            <span className="msv-control-label">Structure</span>
            <select
              className="ui-select"
              value={chosen}
              onChange={e => {
                setChoice(e.target.value)
              }}
            >
              {model && (
                <option value="alphafold">
                  AlphaFold {model.entity} · {model.sequence.length} aa · pLDDT{' '}
                  {model.plddt.toFixed(0)}
                </option>
              )}
              {shown.map(e => (
                <option
                  key={e.pdbId}
                  value={e.pdbId}
                >
                  PDB {e.pdbId.toUpperCase()} · residues {e.start}–{e.end} (
                  {Math.round(e.coverage * 100)}%)
                  {e.resolution ? ` · ${e.resolution.toFixed(1)} Å` : ''}
                </option>
              ))}
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
            No reviewed UniProt entry for {transcript.geneName}, so no structure
            to open.
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

        {superposed.length > 0 && (
          <div className="msv-control">
            <span className="msv-control-label">Superpose</span>
            <span className="msv-chips">
              {superposed.map(r => (
                <button
                  key={r.label}
                  className="ui-chip-btn"
                  title={`Remove ${r.scientificName}`}
                  onClick={() => {
                    if (r.uniprot) {
                      onRemoveSuperposed(r.uniprot)
                    }
                  }}
                >
                  {r.commonName ?? r.scientificName} ×
                </button>
              ))}
            </span>
          </div>
        )}
        {missingModels.length > 0 && (
          <p className="ui-note">
            No AlphaFold model for {missingModels.join(', ')}.
          </p>
        )}

        {selectedDomain && (
          <div className="msv-control">
            <span className="msv-control-label">Highlight</span>
            <span className="msv-chips">
              <button
                className="ui-chip-btn"
                title="Opens with this domain selected in all three views"
                onClick={() => {
                  onClearDomain()
                }}
              >
                {selectedDomain.name} {selectedDomain.start}–
                {selectedDomain.end} ×
              </button>
            </span>
            <span className="ui-caption">
              {!primary
                ? 'needs a structure'
                : domainExact
                  ? 'lit on load in all three views'
                  : chosen !== 'alphafold'
                    ? 'approximate: PDB residue numbering'
                    : modelExact
                      ? `approximate: the domain coordinates are on ${queryRow?.protein ?? 'another isoform'}`
                      : 'approximate: the model is a different isoform'}
            </span>
          </div>
        )}
      </div>

      <div className="msv-actions">
        {translating ? (
          <span className="msv-open msv-open-disabled">Resolving isoform…</span>
        ) : (
          <a
            className="msv-open"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in JBrowse ↗
          </a>
        )}
        <label className="msv-collapse">
          <input
            type="checkbox"
            checked={collapse}
            onChange={e => {
              setCollapse(e.target.checked)
            }}
          />
          Collapse introns
        </label>
        {transcript.strand === -1 && (
          <label className="msv-collapse">
            <input
              type="checkbox"
              checked={flip}
              onChange={e => {
                setFlip(e.target.checked)
              }}
            />
            Read 5′→3′
          </label>
        )}
        {launched.target.variantTrackIds.length > 0 && (
          <label className="msv-collapse">
            <input
              type="checkbox"
              checked={variants}
              onChange={e => {
                setVariants(e.target.checked)
              }}
            />
            ClinVar + AlphaMissense
          </label>
        )}
        <button
          className="ui-linkbtn"
          onClick={() => {
            setDetailsOpen(true)
          }}
        >
          Session details
        </button>
      </div>
      <p className="ui-caption">
        Opens {joinList(carries)} in one connected session.
      </p>
      {alignment && alignmentOmitted && (
        <p className="ui-caption">
          The {alignment.rowCount}-row alignment is too large to ride in a
          launch link on the current JBrowse release, so the session opens
          without it; it stays on this page.
        </p>
      )}

      {detailsOpen && (
        <SessionDetailsDialog
          onClose={() => {
            setDetailsOpen(false)
          }}
          transcript={transcript}
          session={session}
          collapse={collapse}
          flip={flip}
          model={model}
        />
      )}
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
