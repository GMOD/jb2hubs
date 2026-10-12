import '../styles/ui.css'

import { useRef, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { errorText } from './ErrorMessage.tsx'
import GeneCombobox from './GeneCombobox.tsx'
import ProteinLaunchCard from './ProteinLaunchCard.tsx'
import ProteinMap, { type OnRequest } from './ProteinMap.tsx'
import { EDITS, editConsequence, editLine } from './editConsequence.ts'
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
import { hasHundredWay } from './hundredWay.ts'
import { PROTEIN_SPECIES, knownTaxon } from './orthologSearchUtils.ts'
import { resolveRefTaxon } from './orthologSet.ts'
import { SeedRefused } from './pfamSeed.ts'
import {
  type AlignSource,
  loadOrthologs,
  loadPfam,
} from './proteinAlignments.ts'
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
  clauseLine,
  domainHeadline,
  entryShowing,
  translationRanges,
} from './proteinFeatures.ts'
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
    structure: p.get('structure') ?? undefined,
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

// Whether this reader keeps Advanced open: a reader's habit, not part of what
// a link launches, so it lives in localStorage rather than the url.
const ADVANCED_KEY = 'jb2hubs:proteinAdvanced'

function readAdvanced() {
  try {
    return localStorage.getItem(ADVANCED_KEY) === '1'
  } catch {
    return false
  }
}

function writeAdvanced(on: boolean) {
  try {
    if (on) {
      localStorage.setItem(ADVANCED_KEY, '1')
    } else {
      localStorage.removeItem(ADVANCED_KEY)
    }
  } catch {
    // a private window without storage keeps the default
  }
}

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
      if (wanted) {
        void mutate()
      } else {
        setWanted(true)
      }
    },
  }
}

interface Resolved {
  structure: GeneStructure
  // whether this gene has a row in the hosted 100-way alignment
  hundredWay: boolean
}

// The 100-way index is not an NCBI read, so it overlaps the structure's. It is
// keyed on NCBI's canonical spelling of the symbol, which is what the hosted
// index uses: a typed "tp53" would otherwise miss.
async function resolveGene(
  sym: string,
  ref: number,
  signal: AbortSignal,
): Promise<Resolved> {
  const structure = await fetchGeneStructure(sym, ref, signal)
  return {
    structure,
    hundredWay: await hasHundredWay(structure.symbol, ref),
  }
}

export default function ProteinBrowser() {
  // `query` is the submitted search and the SWR key, seeded from the url so a
  // shared link resolves on mount; `gene` is what is in the box.
  const [arrival] = useState(paramsFromUrl)
  const [advanced, setAdvanced] = useState(readAdvanced)
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
      return resolveGene(sym, ref, controller.signal)
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
  // the showcase across species, until Advanced asks for one species' chips
  // The showcase across species, then the rest of the species on screen's own
  // chips. Advanced is settings and changes neither.
  const showcase = showcaseExamples()
  const speciesChips: ShowcaseExample[] = examplesFor(taxId)
    .filter(
      e => !showcase.some(s => s.taxId === taxId && s.symbol === e.symbol),
    )
    .map(e => ({ ...e, taxId }))
  const typed = advanced ? typedSpecies : undefined
  const speciesText =
    typed ??
    PROTEIN_SPECIES.find(s => s.taxId === taxId)?.label ??
    data?.structure.organism ??
    String(taxId)

  return (
    <div>
      <div className="ui-form">
        <GeneCombobox
          value={gene}
          taxId={typed === undefined ? taxId : (knownTaxon(typed) ?? taxId)}
          onChange={v => {
            setGene(v)
          }}
          onSubmit={symbol => {
            void submit(symbol)
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
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  void submit(gene)
                }
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
          className="ui-btn"
          onClick={() => {
            void submit(gene)
          }}
          disabled={!gene.trim() || !speciesText.trim() || species.pending}
        >
          Search
        </button>
        <label className="msv-advanced-switch">
          <input
            type="checkbox"
            checked={advanced}
            onChange={e => {
              setAdvanced(e.target.checked)
              writeAdvanced(e.target.checked)
            }}
          />
          Advanced
        </label>
      </div>

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
                <span className="msv-chip-species">More in {speciesText}:</span>
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

      {(loading || species.pending) && <p className="ui-hint">Resolving…</p>}
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
          {...data}
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
  hundredWay,
  taxId,
  advanced,
  preset,
  structurePick,
}: Resolved & {
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
  const residueFocused =
    focusChoice?.kind === 'residue' ||
    (focusChoice === undefined && !!preset?.residue)
  const { data: pdbEntries, error: pdbEntriesError } = useSWRImmutable(
    uniprotId && residueFocused ? (['pdbe-entries', uniprotId] as const) : null,
    ([, id]) => fetchPdbEntryCount(id),
    LIVE_QUERY,
  )
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
  // what the map and a typed residue are numbered on: the canonical, else
  // the last InterPro region's end
  const proteinLength =
    canonical?.length ??
    (regions?.length ? Math.max(...regions.map(r => r.end)) : undefined)
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
    setFocusChoice(next ?? null)
    setStructureChoice(undefined)
    editProteinUrl(p => {
      focusToParams(presetOf(next), p)
      p.delete('structure')
    })
  }
  const family = focusFamily(focus, regions ?? [])
  // the lists the headline waits on, including PDBe's entry count, which
  // decides whether they are read at all
  const contactsPending =
    residueFocused &&
    ((pdbEntries === undefined && !pdbEntriesError) ||
      (forSentence && (partners.loading || ligands.loading)))
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
  // domain asks what the domain looks like across life, and that is its
  // family's seed; anything else asks how conserved this protein is, and that
  // is its orthologs.
  const source: AlignSource = family ? 'pfam' : 'orthologs'
  // A residue or a preset family waits for InterPro to say which seed it
  // opens, rather than loading the 100-way to discard it.
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
          hundredWay,
          source === 'pfam' ? (family?.pfam ?? '') : '',
          source === 'pfam' ? (family?.start ?? 0) : 0,
        ] as const)
      : null,
    () => {
      const orthologs = () => loadOrthologs(structure, hundredWay)
      switch (source) {
        case 'orthologs':
          return orthologs()
        case 'pfam':
          // A seed the translation cannot be placed in fails the same way
          // every time, so the session takes the orthologs and says why. Any
          // other failure surfaces with a retry, since SWR would otherwise
          // keep the fallback for good.
          return family
            ? loadPfam(structure, family).catch(async (e: unknown) => {
                if (!(e instanceof SeedRefused)) {
                  throw e
                }
                const fallback = await orthologs()
                return {
                  ...fallback,
                  note: [
                    `No ${family.pfam} seed alignment: ${errorText(e)}`,
                    fallback.note,
                  ]
                    .filter(Boolean)
                    .join(' '),
                }
              })
            : orthologs()
      }
    },
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
  // or link named one, and what an edit at it does to the protein. Both count
  // on the launched translation, which the 100-way or a seed may pin to
  // another transcript than the representative one.
  const residueEntry = residueFocus
    ? entryShowing(residueFocus.position, partners.data, ligands.data)
    : undefined
  const residueEntryPending =
    !!residueFocus &&
    !structureChoice &&
    ((pdbEntries === undefined && !pdbEntriesError) || contactsPending)
  const launched: GeneStructure = {
    ...structure,
    ...alignment?.structureOverrides,
  }
  const translation = launched.proteinSequence
  const onTranslation =
    residueFocus && translation && canonical
      ? translationRanges(
          [{ start: residueFocus.position, end: residueFocus.position }],
          canonical,
          translation,
        )?.[0]?.start
      : undefined
  const consequences =
    onTranslation !== undefined && translation
      ? EDITS.flatMap(edit => {
          const c = editConsequence(
            launched.transcript,
            translation.length,
            onTranslation,
            edit,
          )
          // the map, its domains and the focus label count on the canonical
          return c
            ? [
                {
                  ...c,
                  shown: canonical
                    ? (translationRanges(c.lost, translation, canonical) ?? [])
                    : c.lost,
                },
              ]
            : []
        })
      : []
  const consequence = consequences.find(c => c.kind === residueFocus?.edit)

  return (
    <>
      <ProteinLaunchCard
        structure={structure}
        launched={launched}
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
          {regionsLoading && <p className="ui-hint">Reading InterPro…</p>}
          {regionsError ? (
            <p className="ui-note">
              No InterPro annotation could be read: {errorText(regionsError)}
            </p>
          ) : null}
          {regions && (
            <ProteinMap
              length={proteinLength ?? 0}
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
                  <li key={c.kind}>{clauseLine(c)}</li>
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
