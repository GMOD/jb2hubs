import { useMemo, useState } from 'react'

import {
  fetchExperimentalStructures,
  fetchUniProtStructureMappings,
  segmentsForAccession,
  toAuthorRange,
} from 'p2s_mapper'
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
import { type Focus, focusLabel, focusRange } from './proteinFeatures.ts'
import { type StructureSource, buildSessionUrl } from './proteinSession.ts'
import {
  type AlphaFoldModel,
  pickAlphaFoldModel,
  requestAlphaFoldModels,
} from './structureSources.ts'

import type { LoadedAlignment } from './proteinAlignments.ts'
import type { ProteinPanelRow } from './proteinMsa.ts'

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
// this every toggle re-asked the API for every accession already resolved. A
// lookup that failed is forgotten, so asking again reaches the API.
const modelByAccession = new Map<string, Promise<AlphaFoldModel | undefined>>()

async function superposedModel(accession: string) {
  const pending =
    modelByAccession.get(accession) ??
    requestAlphaFoldModels(accession).then(models => pickAlphaFoldModel(models))
  modelByAccession.set(accession, pending)
  try {
    return await pending
  } catch (e) {
    modelByAccession.delete(accession)
    throw e
  }
}

async function superposedModels(accessions: string[]) {
  return Promise.all(
    accessions.map(async accession => {
      try {
        return { accession, model: await superposedModel(accession) }
      } catch (e) {
        return { accession, failure: errorText(e) }
      }
    }),
  )
}

// The launch, and what the page is for — so it leads, and carries one primary
// action. Everything the session can vary on is decided here: which isoform's
// exons, which structure (the AlphaFold model, a PDB entry, or the complex a
// focused partner was seen in), which ortholog structures to superpose, what
// to open on, and the view options.
export default function ProteinLaunchCard({
  structure,
  alignment,
  aligning,
  superposed,
  onRemoveSuperposed,
  queryRow,
  focus,
  onClearFocus,
  story,
}: {
  structure: GeneStructure
  alignment: LoadedAlignment | undefined
  // the alignment the session carries is still loading, and it can pin the
  // transcript, so a launch now would open without it or on another isoform
  aligning: boolean
  // ortholog rows the reader asked to superpose, by Swiss-Prot accession
  superposed: ProteinPanelRow[]
  onRemoveSuperposed: (uniprot: string) => void
  // the panel's row for the query gene, whose protein the cartoon's domains
  // are on
  queryRow: ProteinPanelRow | undefined
  // what the session opens on, from the map or the cartoon
  focus: Focus | undefined
  onClearFocus: () => void
  // a chip's one sentence on what there is to see
  story?: string
}) {
  const { uniprotId, isoforms } = structure
  const [collapse, setCollapse] = useState(true)
  const [flip, setFlip] = useState(structure.transcript.strand === -1)
  const [variants, setVariants] = useState(true)
  const [quiet, setQuiet] = useState(true)
  const [isoformName, setIsoformName] = useState(structure.transcript.name)
  // undefined is "whatever is best": the AlphaFold model, else the
  // best-covering experimental entry once those have loaded
  const [choice, setChoice] = useState<string>()
  const [detailsOpen, setDetailsOpen] = useState(false)

  const isoform =
    isoforms.find(i => i.transcript.name === isoformName) ?? isoforms[0]!
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
  const { data: experimental } = useSWRImmutable(
    uniprotId ? (['experimental-structures', uniprotId] as const) : null,
    ([, id]) => fetchExperimentalStructures(id),
    LIVE_QUERY,
  )
  const accessions = superposed.flatMap(r => (r.uniprot ? [r.uniprot] : []))
  const { data: extras, mutate: retryExtras } = useSWRImmutable(
    accessions.length > 0
      ? (['alphafold-models', ...accessions] as const)
      : null,
    ([, ...ids]) => superposedModels(ids),
    LIVE_QUERY,
  )

  // Memoised, because the card re-renders on every progress message the live
  // alignment posts. Every input is state, a prop, or SWR data, all of which
  // hold their identity between renders.
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
    const shown = (experimental ?? []).slice(0, MAX_EXPERIMENTAL)
    // A focused partner brings the PDB entries the two were seen in together,
    // and the first of those is the structure to open with unless the reader
    // has picked one: the point of the focus is the complex.
    const complexIds =
      focus?.kind === 'region' && focus.region.kind === 'interface'
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
    const range = focus ? focusRange(focus) : undefined
    return { launched, model, shown, complexIds, chosen, primary, range }
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
  const { launched, model, shown, complexIds, chosen, primary, range } = pick

  // A PDB entry is lit by author numbering, which SIFTS maps the UniProt range
  // onto per chain: the same numbers for most entries, one behind for a chain
  // numbered from the mature protein (haemoglobin), or a construct's own.
  const pdbId = primary && 'pdbId' in primary ? primary.pdbId : undefined
  // p2s_mapper's own read retries a dropped request twice behind a 20s
  // deadline. A read that still fails lights nothing rather than the UniProt
  // range, which on 2HHB would put HBB's E6V chip on residue 7 instead of 6.
  const {
    data: sifts,
    error: numberingError,
    isLoading: numbering,
    mutate: retryNumbering,
  } = useSWRImmutable(
    range && pdbId && uniprotId ? (['sifts', pdbId, uniprotId] as const) : null,
    async ([, pdb, acc]) =>
      segmentsForAccession(await fetchUniProtStructureMappings(pdb), acc),
    LIVE_QUERY,
  )
  const author = range && sifts ? toAuthorRange(sifts, range) : undefined
  const unnumbered = !!pdbId && !!numberingError && !numbering

  // Building the url deflates the whole inline alignment, so it is memoised on
  // its own.
  const launch = useMemo(() => {
    const found = (extras ?? []).flatMap(e =>
      'model' in e && e.model ? [e.model] : [],
    )
    const missingModels = (extras ?? [])
      .filter(e => 'model' in e && !e.model)
      .map(e => e.accession)
    const unreachable = (extras ?? []).flatMap(e => ('failure' in e ? [e] : []))
    // A focus is a range on some protein sequence; the plugin lights structure
    // residues. The map's regions are on the UniProt canonical, so they are
    // exact when the model IS the canonical and was folded from the launched
    // translation. A cartoon domain is on the panel's query protein instead
    // (MANE, else longest), which need not be the launched transcript's; the
    // row is matched by accession, and by length where the accession cannot
    // agree — a PANTHER row is a UniProt entry, and the 100-way's transcript
    // has no RefSeq protein to name.
    const modelExact =
      chosen === 'alphafold' &&
      !!model &&
      model.sequence === launched.proteinSequence
    const canonicalModel = !!model && !model.accession.includes('-')
    const launchedProtein = isoforms.find(
      i => i.transcript.name === launched.transcript.name,
    )?.protein
    const rowExact =
      !!queryRow &&
      (queryRow.protein === launchedProtein ||
        queryRow.length === launched.proteinSequence?.length)
    const fromCartoon = focus?.kind === 'region' && !focus.region.accession
    const focusExact = fromCartoon
      ? modelExact && rowExact
      : modelExact && canonicalModel
    return {
      found,
      missingModels,
      unreachable,
      modelExact,
      canonicalModel,
      fromCartoon,
      focusExact,
      ...buildSessionUrl({
        structure: launched,
        primary,
        superposed: found.map(m => ({ url: m.url })),
        ...(range && chosen === 'alphafold'
          ? { initialSelection: { start: range.start - 1, end: range.end } }
          : {}),
        ...(range && pdbId && !unnumbered
          ? {
              initialResidues: author
                ? { start: author.start, end: author.end }
                : range,
            }
          : {}),
        collapse,
        flip,
        msa: alignment?.source,
        variantTracks: variants,
        quiet,
        // an identity alignment is a wall of matches with nothing to read
        showAlignment: !modelExact,
      }),
    }
  }, [
    launched,
    model,
    chosen,
    primary,
    range,
    pdbId,
    author,
    unnumbered,
    isoforms,
    alignment,
    extras,
    queryRow,
    focus,
    collapse,
    flip,
    variants,
    quiet,
  ])
  const {
    found,
    missingModels,
    unreachable,
    modelExact,
    canonicalModel,
    fromCartoon,
    focusExact,
    session,
    url,
    loc,
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
    alignment?.carries,
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
      {story && <p className="msv-story">{story}</p>}

      <div className="msv-controls">
        {pinned ? (
          <div className="msv-control">
            <span className="msv-control-label">Isoform</span>
            <span>
              {transcript.name}{' '}
              <span className="ui-caption">set by the alignment</span>
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
              {focus?.kind === 'region' && complexIds.length > 0 && (
                <optgroup label={`In complex with ${focus.region.name}`}>
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
        {unreachable.length > 0 && (
          <p className="ui-error">
            AlphaFold DB did not answer for{' '}
            {unreachable.map(e => e.accession).join(', ')} (
            {unreachable[0]!.failure}).{' '}
            <button
              className="ui-linkbtn"
              onClick={() => {
                void retryExtras()
              }}
            >
              Try again
            </button>
          </p>
        )}

        {focus && (
          <div className="msv-control">
            <span className="msv-control-label">Opens on</span>
            <span className="msv-chips">
              <button
                className="ui-chip-btn"
                title="Selected in all three views when the session opens; click to clear"
                onClick={() => {
                  onClearFocus()
                }}
              >
                {focusLabel(focus)} ×
              </button>
            </span>
            {unnumbered ? (
              <span className="ui-error">
                not lit: PDBe did not say how this entry numbers its chains (
                {errorText(numberingError)}).{' '}
                <button
                  className="ui-linkbtn"
                  onClick={() => {
                    void retryNumbering()
                  }}
                >
                  Try again
                </button>
              </span>
            ) : (
              <span className="ui-caption">
                {!primary
                  ? 'needs a structure'
                  : focusExact
                    ? 'lit on load in all three views'
                    : pdbId
                      ? numbering
                        ? 'reading how the entry numbers its chains'
                        : author
                          ? author.shift
                            ? `lit as ${author.start === author.end ? author.start : `${author.start}–${author.end}`} in chain ${author.chain}, which numbers ${Math.abs(author.shift)} ${author.shift < 0 ? 'behind' : 'ahead of'} UniProt`
                            : `lit on load; chain ${author.chain} is numbered as UniProt is`
                          : 'not in this entry: no chain covers the range'
                      : !modelExact
                        ? 'approximate: the model is a different isoform'
                        : fromCartoon
                          ? `approximate: the domain coordinates are on ${queryRow?.protein ?? 'another isoform'}`
                          : canonicalModel
                            ? 'approximate'
                            : 'approximate: an isoform model, and the map counts on the canonical'}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="msv-actions">
        {translating || numbering || aligning ? (
          <span className="msv-open msv-open-disabled">
            {translating
              ? 'Resolving isoform…'
              : numbering
                ? 'Resolving numbering…'
                : 'Loading alignment…'}
          </span>
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
        <label
          className="msv-collapse"
          title="The genome view without its overview bar and gridlines, and no pairwise panel when the structure is the translation's own fold"
        >
          <input
            type="checkbox"
            checked={quiet}
            onChange={e => {
              setQuiet(e.target.checked)
            }}
          />
          Quiet layout
        </label>
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
        Opens {joinList(carries)} in one connected session
        {focus && primary && !unnumbered ? `, on ${focusLabel(focus)}` : ''}.
      </p>

      {detailsOpen && (
        <SessionDetailsDialog
          onClose={() => {
            setDetailsOpen(false)
          }}
          geneName={transcript.geneName}
          session={session}
          loc={loc}
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
