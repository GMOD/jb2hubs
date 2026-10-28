import '../styles/ui.css'

import { useRef, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { readFlag, writeFlag } from '../lib/localFlag.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import { errorText } from './ErrorMessage.tsx'
import GeneCombobox from './GeneCombobox.tsx'
import ProteinLaunchCard from './ProteinLaunchCard.tsx'
import ProteinMap, { type OnRequest } from './ProteinMap.tsx'
import { editLine } from './editConsequence.ts'
import {
  type ExampleFocus,
  type ProteinExample,
  type ShowcaseExample,
  examplesFor,
  showcaseExamples,
  focusFromParams,
  focusToParams,
} from './geneExamples.ts'
import {
  type GeneStructure,
  canonicalSequence,
  fetchGeneStructure,
} from './geneStructure.ts'
import { PROTEIN_SPECIES, knownTaxon } from './orthologSearchUtils.ts'
import { resolveRefTaxon } from './orthologSet.ts'
import { type AlignSource, loadLaunchAlignment } from './proteinAlignments.ts'
import {
  type Focus,
  type ProteinRegion,
  fetchInterProRegions,
  fetchInterfaceRegions,
  fetchLigandSites,
  EAGER_PDB_ENTRIES,
  fetchPdbEntryCount,
  focusFamily,
  focusFromPreset,
  focusLabel,
  presetOf,
  sameFocus,
  clauseLine,
  domainHeadline,
  entryShowing,
} from './proteinFeatures.ts'
import { residueConsequences } from './proteinLaunch.ts'
import { useResidueFacts } from './useResidueFacts.ts'

// client:only island, so window is available for the shareable link. Any
// taxon is a reference, as on /gene, which links here with whatever species
// it was showing.
function paramsFromUrl() {
  const p = new URLSearchParams(window.location.search)
  return {
    gene: p.get('gene')?.trim() ?? '',
    ref: knownTaxon(p.get('ref') ?? '') ?? 9606,
    focus: focusFromParams(p),
    structure: p.get('structure')?.toLowerCase(),
  }
}

// The same shape written onto the page, so what is on screen stays a link: a
// submission starts it over with the gene, the species and the chip's focus
// and structure, and a later focus edits it in place.
function syncProteinUrl(symbol: string, taxId: number, chip?: ProteinExample) {
  const p = new URLSearchParams({ gene: symbol, ref: String(taxId) })
  focusToParams(chip?.focus, p)
  if (chip?.structure) {
    p.set('structure', chip.structure)
  }
  window.history.replaceState(null, '', `?${p}`)
}

function editProteinUrl(edit: (p: URLSearchParams) => void) {
  const p = new URLSearchParams(window.location.search)
  edit(p)
  window.history.replaceState(null, '', `?${p}`)
}

// Whether this reader keeps Advanced open. No link sets it.
const ADVANCED_KEY = 'jb2hubs:proteinAdvanced'

// Regions PDBe-KB serves by the half megabyte, read when the reader asks for
// them or a chip or link names one, and asked again after a failure. `eager`
// reads the data for a sentence without showing the map's lane.
function useOnRequest(
  name: string,
  uniprotId: string | undefined,
  fetcher: (uniprotId: string) => Promise<ProteinRegion[]>,
  preset: boolean,
  eager: boolean,
) {
  const [wanted, setWanted] = useState(preset)
  const { data, error, isLoading, mutate } = useSWRImmutable(
    uniprotId && (wanted || eager) ? ([name, uniprotId] as const) : null,
    ([, id]) => fetcher(id),
    LIVE_QUERY,
  )
  const state: OnRequest = !wanted
    ? { status: 'idle' }
    : isLoading
      ? { status: 'loading' }
      : error
        ? { status: 'error', message: errorText(error) }
        : { status: 'loaded', regions: data ?? [] }
  return {
    data,
    loading: isLoading,
    state,
    request: () => {
      if (error) {
        void mutate()
      }
      setWanted(true)
    },
  }
}

export default function ProteinBrowser() {
  // `query` is the submitted search and the SWR key, seeded from the url so a
  // shared link resolves on mount; `gene` is what is in the box.
  const [arrival] = useState(paramsFromUrl)
  const [advanced, setAdvanced] = useState(() => readFlag(ADVANCED_KEY))
  const [query, setQuery] = useState({ gene: arrival.gene, ref: arrival.ref })
  const [gene, setGene] = useState(query.gene)
  // Advanced's species box is free text, resolved on submit through NCBI
  // Taxonomy unless it names a suggested species.
  const [typedSpecies, setTypedSpecies] = useState<string>()
  const [species, setSpecies] = useState<{
    pending?: boolean
    error?: unknown
  }>({})
  // Which submission is the latest, so a species lookup that answers after
  // something newer was asked for is dropped.
  const latestSubmit = useRef(0)
  // What the results open on: the link's focus and structure on arrival, a
  // chip's after a click, nothing after a typed search.
  const [opens, setOpens] = useState<
    Pick<ProteinExample, 'focus' | 'structure'>
  >(() => ({ focus: arrival.focus, structure: arrival.structure }))
  // Keys the results, so resubmitting the gene on screen (its chip again, say)
  // starts them over.
  const [submission, setSubmission] = useState(0)
  // The lookup in flight, so a replaced query gives up the NCBI requests it
  // still has queued instead of holding them ahead of the new one. Its abort
  // lands as an error on the replaced query's key, which nothing shows.
  const resolving = useRef<{ key: string; controller: AbortController }>(
    undefined,
  )

  const {
    data,
    error,
    isLoading: loading,
    mutate: retry,
  } = useSWRImmutable(
    query.gene ? (['protein-gene', query.gene, query.ref] as const) : null,
    ([, sym, ref]) => {
      const key = `${sym}:${ref}`
      if (resolving.current?.key !== key) {
        resolving.current?.controller.abort()
      }
      const controller = new AbortController()
      resolving.current = { key, controller }
      return fetchGeneStructure(sym, ref, controller.signal)
    },
    LIVE_QUERY,
  )

  // Submits a query. The same query again is a no-op for SWR — an equal key is
  // not a refetch — so a failed one is re-run explicitly.
  const run = (rawQuery: string, ref: number, chip?: ProteinExample) => {
    const sym = rawQuery.trim()
    if (sym) {
      latestSubmit.current += 1
      setSpecies({})
      setOpens({ focus: chip?.focus, structure: chip?.structure })
      setSubmission(n => n + 1)
      setGene(sym)
      if (sym === query.gene && ref === query.ref) {
        if (error) {
          void retry()
        }
      } else {
        setQuery({ gene: sym, ref })
      }
      syncProteinUrl(sym, ref, chip)
    }
  }

  // The gene in the species the box names. The box keeps what was typed; a
  // chip, which belongs to the species already on screen, puts that species'
  // name back.
  const submit = async (symbol: string) => {
    if (!symbol.trim()) {
      return
    }
    latestSubmit.current += 1
    const request = latestSubmit.current
    const typed = advanced ? typedSpecies : undefined
    const known = typed === undefined ? query.ref : knownTaxon(typed)
    if (known !== undefined) {
      run(symbol, known)
    } else {
      setSpecies({ pending: true })
      try {
        const ref = await resolveRefTaxon(typed ?? '')
        if (request === latestSubmit.current) {
          run(symbol, ref)
        }
      } catch (e) {
        if (request === latestSubmit.current) {
          setSpecies({ error: e })
        }
      }
    }
  }

  const taxId = query.ref
  // The showcase across species, then the rest of the species on screen's own
  // chips. Advanced is settings and changes neither.
  const showcase = showcaseExamples()
  const speciesChips: ShowcaseExample[] = examplesFor(taxId)
    .filter(
      e => !showcase.some(s => s.taxId === taxId && s.symbol === e.symbol),
    )
    .map(e => ({ ...e, taxId }))
  const typed = advanced ? typedSpecies : undefined
  const submittedSpecies =
    PROTEIN_SPECIES.find(s => s.taxId === taxId)?.label ??
    data?.organism ??
    String(taxId)
  const speciesText = typed ?? submittedSpecies
  const canSearch = !!gene.trim() && !!speciesText.trim() && !species.pending

  return (
    <div>
      <form
        className="ui-form"
        onSubmit={e => {
          e.preventDefault()
          if (canSearch) {
            void submit(gene)
          }
        }}
      >
        <GeneCombobox
          value={gene}
          taxId={typed === undefined ? taxId : (knownTaxon(typed) ?? taxId)}
          onChange={v => {
            setGene(v)
          }}
          onSubmit={symbol => {
            if (speciesText.trim() && !species.pending) {
              void submit(symbol)
            }
          }}
        />
        {advanced && (
          <>
            <input
              className="ui-select"
              list="protein-species"
              value={speciesText}
              onChange={e => {
                setTypedSpecies(e.target.value)
              }}
              aria-label="Reference species"
              placeholder="Species name or taxid"
              title="Any species name or NCBI taxon id, with a genome this site hosts"
            />
            <datalist id="protein-species">
              {PROTEIN_SPECIES.map(s => (
                <option
                  key={s.taxId}
                  value={s.label}
                />
              ))}
            </datalist>
          </>
        )}
        <button
          type="submit"
          className="ui-btn"
          disabled={!canSearch}
        >
          Search
        </button>
        <label className="msv-advanced-switch">
          <input
            type="checkbox"
            checked={advanced}
            onChange={e => {
              setAdvanced(e.target.checked)
              writeFlag(ADVANCED_KEY, e.target.checked)
            }}
          />
          Advanced
        </label>
      </form>

      {species.error ? (
        <p className="ui-error">{errorText(species.error)}</p>
      ) : null}

      {[showcase, speciesChips].map(
        (row, i) =>
          row.length > 0 && (
            <div
              key={i}
              className="msv-examples"
            >
              {i === 1 && (
                <span className="msv-chip-species">
                  More in {submittedSpecies}:
                </span>
              )}
              {row.map(ex => (
                <button
                  key={`${ex.taxId}-${ex.symbol}`}
                  className="ui-chip-btn"
                  title={ex.note}
                  onClick={() => {
                    setTypedSpecies(undefined)
                    run(ex.symbol, ex.taxId, ex)
                  }}
                >
                  {ex.symbol}
                  {ex.species && (
                    <span className="msv-chip-species"> · {ex.species}</span>
                  )}
                </button>
              ))}
            </div>
          ),
      )}

      {(loading || species.pending) && (
        <p
          className="ui-hint"
          role="status"
        >
          Resolving…
        </p>
      )}
      {!loading && error ? (
        <p className="ui-error">
          {errorText(error)}{' '}
          <button
            className="ui-linkbtn"
            onClick={() => {
              void retry()
            }}
          >
            Try again
          </button>
        </p>
      ) : null}

      {data && (
        // Remounted per submission, which is what drops a previous gene's
        // alignment request and focus without an effect.
        <GeneResults
          key={`${query.gene}:${query.ref}:${submission}`}
          structure={data}
          taxId={query.ref}
          advanced={advanced}
          preset={opens.focus}
          structurePick={opens.structure}
        />
      )}
    </div>
  )
}

// Everything downstream of a resolved gene. The page is a launcher, so the
// session card leads with the one primary action, and the protein map under it
// is where the session's focus is chosen. The alignment is not drawn here, only
// loaded, because it is what the launched session carries.
function GeneResults({
  structure,
  taxId,
  advanced,
  preset,
  structurePick,
}: {
  structure: GeneStructure
  taxId: number
  advanced: boolean
  preset?: ExampleFocus
  structurePick?: string
}) {
  const { symbol, uniprotId } = structure
  const canonical = canonicalSequence(structure)

  // The map's regions: InterPro's, on the query protein alone, so they are on
  // screen in a second or two. The partner and ligand lists are PDBe's and run
  // to half a megabyte on a well-studied protein, so each is read when asked
  // for, when the chip or link names one of its rows, or when a residue is
  // focused, for the sentence saying what it touches. That last read waits on
  // PDBe's entry count and skips a protein past EAGER_PDB_ENTRIES.
  const {
    data: regions,
    error: regionsError,
    isLoading: regionsLoading,
  } = useSWRImmutable(
    uniprotId ? (['interpro-regions', uniprotId] as const) : null,
    ([, id]) => fetchInterProRegions(id),
    LIVE_QUERY,
  )
  // What the session opens on. The chip's preset holds until the reader picks
  // something else; `null` records that they cleared it, so it does not come
  // back when the regions it named finish loading.
  const [focusChoice, setFocusChoice] = useState<Focus | null>()
  // what the map and a typed residue are numbered on: the canonical, else
  // the last InterPro region's end
  const proteinLength =
    canonical?.length ??
    (regions?.length ? Math.max(...regions.map(r => r.end)) : undefined)
  const presetResidueFits =
    !!preset?.residue &&
    (proteinLength === undefined || preset.residue <= proteinLength)
  const residueFocused =
    focusChoice?.kind === 'residue' ||
    (focusChoice === undefined && presetResidueFits)
  const { data: pdbEntries, error: pdbEntriesError } = useSWRImmutable(
    uniprotId && residueFocused ? (['pdbe-entries', uniprotId] as const) : null,
    ([, id]) => fetchPdbEntryCount(id),
    LIVE_QUERY,
  )
  const pdbEntriesPending =
    !!uniprotId &&
    residueFocused &&
    pdbEntries === undefined &&
    !pdbEntriesError
  const forSentence =
    residueFocused &&
    pdbEntries !== undefined &&
    pdbEntries <= EAGER_PDB_ENTRIES
  const partners = useOnRequest(
    'pdbe-interfaces',
    uniprotId,
    fetchInterfaceRegions,
    !!preset?.partner,
    forSentence,
  )
  const ligands = useOnRequest(
    'pdbe-ligand-sites',
    uniprotId,
    fetchLigandSites,
    !!preset?.ligand,
    forSentence,
  )
  const fromPreset = focusFromPreset(
    preset,
    regions,
    partners.data,
    ligands.data,
  )
  // a link's residue past the protein's end would light nothing, silently
  const presetFocus =
    fromPreset?.kind === 'residue' &&
    proteinLength !== undefined &&
    fromPreset.position > proteinLength
      ? undefined
      : fromPreset
  const focus = focusChoice === null ? undefined : (focusChoice ?? presetFocus)
  // The structure named by the chip, the link or a pick in Advanced. A new
  // focus starts it over, since the entry may not cover the new focus and a
  // partner's complex is the point of focusing on it.
  const [structureChoice, setStructureChoice] = useState(structurePick)
  const setFocus = (next: Focus | undefined) => {
    const keepStructure = sameFocus(focus, next)
    setFocusChoice(next ?? null)
    if (!keepStructure) {
      setStructureChoice(undefined)
    }
    editProteinUrl(p => {
      focusToParams(presetOf(next), p)
      if (!keepStructure) {
        p.delete('structure')
      }
    })
  }
  const family = focusFamily(focus, regions ?? [])
  // the lists the headline waits on, including PDBe's entry count, which
  // decides whether they are read at all
  const contactsPending =
    pdbEntriesPending || (forSentence && (partners.loading || ligands.loading))
  const { headline, clauses, conserved, variantLines } = useResidueFacts({
    uniprotId,
    canonical,
    regions,
    focus,
    partners: partners.data,
    ligands: ligands.data,
    contactsPending,
  })
  const residueFocus = focus?.kind === 'residue' ? focus : undefined

  // The alignment is the one the reader's last gesture asks for. A focused
  // domain, or a residue inside one, asks what the domain looks like across
  // life, and that is its family's seed; anything else asks how conserved this
  // protein is, and that is its orthologs.
  const source: AlignSource = family ? 'pfam' : 'orthologs'
  // A residue or a preset family waits for InterPro to say which seed it
  // opens, rather than starting the orthologs to discard them.
  const familyPending =
    regionsLoading &&
    (focus?.kind === 'residue' || (focusChoice === undefined && !!preset?.pfam))
  const partnerPending =
    focusChoice === undefined &&
    ((partners.loading && !!preset?.partner) ||
      (ligands.loading && !!preset?.ligand))

  // Only the seed alignment is keyed on the domain instance, which its placed
  // rows are cut from.
  const {
    data: alignment,
    error,
    isLoading: aligning,
    mutate: retry,
  } = useSWRImmutable(
    !familyPending
      ? ([
          'protein-alignment',
          symbol,
          taxId,
          source,
          source === 'pfam' ? (family?.pfam ?? '') : '',
          source === 'pfam' ? (family?.start ?? 0) : 0,
        ] as const)
      : null,
    () => loadLaunchAlignment(structure, family),
    LIVE_QUERY,
  )
  // a focused domain's line waits for its seed, which it names
  const lead =
    focus?.kind === 'region'
      ? regions && !aligning
        ? domainHeadline(focus.region, regions, alignment?.seedRows)
        : undefined
      : headline

  // The structure a focused residue is seen doing something in, unless a chip
  // or link named one, and what an edit at it does to the protein.
  const residueEntry = residueFocus
    ? entryShowing(residueFocus.position, partners.data, ligands.data)
    : undefined
  const residueEntryPending =
    !!residueFocus && !structureChoice && contactsPending
  const consequences = residueConsequences(structure, residueFocus)
  const consequence = consequences.find(c => c.kind === residueFocus?.edit)

  return (
    <>
      <ProteinLaunchCard
        structure={structure}
        advanced={advanced}
        alignment={alignment}
        aligning={aligning || familyPending}
        alignmentError={error}
        onRetryAlignment={() => {
          void retry()
        }}
        focus={focus}
        focusPending={partnerPending || familyPending || residueEntryPending}
        onFocus={setFocus}
        residueEntry={residueEntry}
        consequence={consequence}
        proteinLength={proteinLength}
        structureChoice={structureChoice}
        onStructure={choice => {
          setStructureChoice(choice)
          editProteinUrl(p => {
            p.set('structure', choice)
          })
        }}
      />

      {uniprotId && (
        <section className="pm-section">
          {regionsLoading && (
            <p
              className="ui-hint"
              role="status"
            >
              Reading InterPro…
            </p>
          )}
          {regionsError ? (
            <p className="ui-note">
              No InterPro annotation could be read: {errorText(regionsError)}
            </p>
          ) : null}
          {regions && proteinLength !== undefined && (
            <ProteinMap
              length={proteinLength}
              regions={regions}
              partners={partners.state}
              onLoadPartners={partners.request}
              ligands={ligands.state}
              onLoadLigands={ligands.request}
              offerContacts={advanced}
              focus={focus}
              onFocus={setFocus}
              shade={consequence?.shown}
            />
          )}
          {lead && <p className="pm-headline">{lead}</p>}
          {residueFocus &&
          (clauses.length > 0 ||
            conserved ||
            variantLines ||
            consequences.length > 0) ? (
            <details className="pm-more">
              <summary>More about residue {residueFocus.position}</summary>
              <ul className="pm-fact">
                {clauses.map(c => (
                  <li key={clauseLine(c)}>{clauseLine(c)}</li>
                ))}
                {conserved && <li>{conserved}</li>}
                {consequences.map(c => (
                  <li key={c.kind}>
                    {editLine(c, focusLabel(residueFocus), regions)}{' '}
                    {residueFocus.edit === c.kind ? (
                      <span className="ui-hint">
                        The session opens on them.
                      </span>
                    ) : (
                      <button
                        className="ui-linkbtn"
                        onClick={() => {
                          setFocus({ ...residueFocus, edit: c.kind })
                        }}
                      >
                        Open on them
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {variantLines && (
                <div className="pm-fact">
                  <p>
                    <a
                      href={`https://www.uniprot.org/uniprotkb/${uniprotId}/variant-viewer`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      UniProt
                    </a>{' '}
                    {variantLines.notes.length || variantLines.rest
                      ? `reports at ${variantLines.at}:`
                      : `reports no substitution at ${variantLines.at}.`}
                  </p>
                  {variantLines.notes.length > 0 && (
                    <ul>
                      {variantLines.notes.map(n => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  )}
                  {variantLines.rest && <p>{variantLines.rest}</p>}
                </div>
              )}
            </details>
          ) : null}
        </section>
      )}
    </>
  )
}
