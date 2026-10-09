import '../styles/ui.css'

import { useMemo, useRef, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { LIVE_QUERY } from '../lib/swr.ts'
import { errorText } from './ErrorMessage.tsx'
import GeneCombobox from './GeneCombobox.tsx'
import HelpButton from './HelpButton.tsx'
import { HelpDialog } from './ProteinBrowserDialogs.tsx'
import ProteinLaunchCard from './ProteinLaunchCard.tsx'
import ProteinMap, { type PartnersState } from './ProteinMap.tsx'
import {
  type ExampleFocus,
  type ProteinExample,
  examplesFor,
  focusFromParams,
  focusToParams,
} from './geneExamples.ts'
import {
  type GeneStructure,
  canonicalSequence,
  fetchGeneStructure,
} from './geneStructure.ts'
import { hasHundredWay } from './hundredWay.ts'
import { PROTEIN_SPECIES, geneUrl, knownTaxon } from './orthologSearchUtils.ts'
import { resolveRefTaxon } from './orthologSet.ts'
import {
  type AlignSource,
  loadHundredWay,
  loadPfam,
  loadUniref,
} from './proteinAlignments.ts'
import {
  type Focus,
  fetchInterProRegions,
  fetchInterfaceRegions,
  focusFamily,
  focusFromPreset,
  presetOf,
} from './proteinFeatures.ts'
// What the reader set on the card beyond the focus, so a copied link reopens
// the same launch: `isoform=NM_000546.6`, `structure=alphafold` (or `none`, or
// a PDB id). Each is checked where it is used, and one that is no longer on
// offer is ignored.
interface LaunchPicks {
  isoform?: string
  structure?: string
}

type LaunchParam = 'isoform' | 'structure'

const TOKEN = /^[\w.-]+$/

function picksFromParams(p: URLSearchParams): LaunchPicks {
  const token = (name: LaunchParam) => {
    const value = p.get(name)
    return value && TOKEN.test(value) ? value : undefined
  }
  return {
    isoform: token('isoform'),
    structure: token('structure'),
  }
}

// client:only island, so window is available for the shareable link. Any
// taxon is a reference, as on /gene, which links here with whatever species
// it was showing.
function paramsFromUrl() {
  const p = new URLSearchParams(window.location.search)
  return {
    gene: p.get('gene')?.trim() ?? '',
    ref: knownTaxon(p.get('ref') ?? '') ?? 9606,
    focus: focusFromParams(p),
    picks: picksFromParams(p),
  }
}

// The same shape written onto the page, so what is on screen stays a link: a
// submission starts it over with the gene, the species and the chip's focus,
// and every later pick edits it in place.
function syncProteinUrl(
  symbol: string,
  taxId: number,
  focus: ExampleFocus | undefined,
) {
  const p = new URLSearchParams({ gene: symbol, ref: String(taxId) })
  focusToParams(focus, p)
  window.history.replaceState(null, '', `?${p}`)
}

function editProteinUrl(edit: (p: URLSearchParams) => void) {
  const p = new URLSearchParams(window.location.search)
  edit(p)
  window.history.replaceState(null, '', `?${p}`)
}

function speciesLabel(taxId: number) {
  return PROTEIN_SPECIES.find(s => s.taxId === taxId)?.label ?? String(taxId)
}

function setLaunchParam(name: LaunchParam, value: string | undefined) {
  editProteinUrl(p => {
    if (value) {
      p.set(name, value)
    } else {
      p.delete(name)
    }
  })
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
  // The submitted query, as opposed to what is currently in the boxes: it is the
  // SWR key, so it changes only on Explore/Enter/an example chip. Seeded from the
  // page url, which is what makes a shared ?gene=&ref= link resolve on mount —
  // this island is client:only, so window is readable during the first render.
  const [arrival] = useState(paramsFromUrl)
  const [query, setQuery] = useState({ gene: arrival.gene, ref: arrival.ref })
  const [gene, setGene] = useState(query.gene)
  // The species box is free text, resolved on submit: a suggested species by
  // name without a request, anything else through NCBI Taxonomy.
  const [speciesText, setSpeciesText] = useState(() => speciesLabel(query.ref))
  const [species, setSpecies] = useState<{
    pending?: boolean
    error?: unknown
  }>({})
  // Which submission is the latest, so a species lookup that answers after
  // something newer was asked for is dropped.
  const latestSubmit = useRef(0)
  const [helpOpen, setHelpOpen] = useState(false)
  // The chip the current query came from, when it did, whose focus the
  // results open on. A typed query has none.
  const [example, setExample] = useState<ProteinExample>()
  // Counts submissions, so resubmitting the gene on screen (its chip again,
  // say) starts its results over with what the url now says. The arrival is
  // submission 0, the only one the link's own focus applies to.
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
      setExample(chip)
      setSubmission(n => n + 1)
      setGene(sym)
      if (sym === query.gene && ref === query.ref) {
        if (error) {
          void retry()
        }
      } else {
        setQuery({ gene: sym, ref })
      }
      syncProteinUrl(sym, ref, chip?.focus)
    }
  }

  // The gene in the species the box names. The box keeps what was typed when
  // it resolves; a chip, which belongs to the species already on screen, puts
  // that species' name back.
  const submit = async (symbol: string) => {
    if (!symbol.trim()) {
      return
    }
    latestSubmit.current += 1
    const request = latestSubmit.current
    const known = knownTaxon(speciesText)
    if (known !== undefined) {
      run(symbol, known)
    } else {
      setSpecies({ pending: true })
      try {
        const ref = await resolveRefTaxon(speciesText)
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
  const examples = examplesFor(taxId)

  return (
    <div>
      <div className="ui-form">
        <GeneCombobox
          value={gene}
          taxId={knownTaxon(speciesText) ?? taxId}
          disabled={false}
          onChange={v => {
            setGene(v)
          }}
          onSubmit={symbol => {
            void submit(symbol)
          }}
        />
        <input
          className="ui-select"
          list="protein-species"
          value={speciesText}
          onChange={e => {
            setSpeciesText(e.target.value)
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
        <button
          className="ui-btn"
          onClick={() => {
            void submit(gene)
          }}
          disabled={!gene.trim() || !speciesText.trim() || species.pending}
        >
          Explore
        </button>
        <HelpButton
          label="How the protein browser works"
          onClick={() => {
            setHelpOpen(true)
          }}
        />
      </div>

      {species.error ? (
        <p className="ui-error">{errorText(species.error)}</p>
      ) : null}

      {examples.length > 0 && (
        <div className="msv-examples">
          <span>Examples:</span>
          {examples.map(ex => (
            <button
              key={ex.symbol}
              className="ui-chip-btn"
              title={ex.note}
              onClick={() => {
                setSpeciesText(speciesLabel(taxId))
                run(ex.symbol, taxId, ex)
              }}
            >
              {ex.symbol}
            </button>
          ))}
        </div>
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
          preset={
            example?.symbol.toUpperCase() === query.gene.toUpperCase()
              ? example.focus
              : submission === 0
                ? arrival.focus
                : undefined
          }
          linkPicks={submission === 0 ? arrival.picks : undefined}
        />
      )}

      {helpOpen && (
        <HelpDialog
          onClose={() => {
            setHelpOpen(false)
          }}
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
  preset,
  linkPicks,
}: Resolved & {
  taxId: number
  // what the chip or the link the reader arrived by opens on
  preset?: ExampleFocus
  linkPicks?: LaunchPicks
}) {
  const { symbol, uniprotId, isoforms } = structure
  const canonical = canonicalSequence(structure)

  // The map's regions: InterPro's, on the query protein alone, so they are on
  // screen in a second or two. The partner list is PDBe's and can run to half a
  // megabyte on a well-studied protein, so it is read when asked for — or when
  // the chip's preset names a partner.
  const {
    data: regions,
    error: regionsError,
    isLoading: regionsLoading,
  } = useSWRImmutable(
    uniprotId ? (['interpro-regions', uniprotId] as const) : null,
    ([, id]) => fetchInterProRegions(id),
    LIVE_QUERY,
  )
  const [wantPartners, setWantPartners] = useState(!!preset?.partner)
  const {
    data: partners,
    error: partnersError,
    isLoading: partnersLoading,
    mutate: retryPartners,
  } = useSWRImmutable(
    uniprotId && wantPartners
      ? (['pdbe-interfaces', uniprotId] as const)
      : null,
    ([, id]) => fetchInterfaceRegions(id),
    LIVE_QUERY,
  )
  const partnersState: PartnersState = !wantPartners
    ? { status: 'idle' }
    : partnersLoading
      ? { status: 'loading' }
      : partnersError
        ? { status: 'error', message: errorText(partnersError) }
        : { status: 'loaded', partners: partners ?? [] }

  // What the session opens on. The chip's preset holds until the reader picks
  // something else; `null` records that they cleared it, so it does not come
  // back when the regions it named finish loading.
  const [focusChoice, setFocusChoice] = useState<Focus | null>()
  // memoised, since the card carries the focus onto another isoform by
  // alignment
  const presetFocus = useMemo(
    () => focusFromPreset(preset, regions, partners),
    [preset, regions, partners],
  )
  const focus = focusChoice === null ? undefined : (focusChoice ?? presetFocus)
  const setFocus = (next: Focus | undefined) => {
    setFocusChoice(next ?? null)
    editProteinUrl(p => {
      focusToParams(presetOf(next), p)
    })
  }
  const family = focusFamily(focus, regions ?? [])

  const [isoformName, setIsoformName] = useState(
    linkPicks?.isoform ?? structure.transcript.name,
  )
  const isoform =
    isoforms.find(i => i.transcript.name === isoformName) ?? isoforms[0]!
  const otherIsoform = isoform.transcript.name !== structure.transcript.name

  // The alignment is the one the reader's last gesture asks for. A focused
  // domain asks what the domain looks like across life, and that is its
  // family's seed. Otherwise the 100-way is one indexed read, so where it
  // exists it is the better first impression: 100 vertebrates with no wait.
  // Elsewhere the UniRef cluster, which costs no job either and exists for any
  // gene UniProt knows. The seed and the 100-way pin the transcript their query
  // row translates, so another isoform takes UniRef, which the plugin builds
  // from the launched translation.
  const source: AlignSource = otherIsoform
    ? 'uniref'
    : family
      ? 'pfam'
      : hundredWay
        ? 'hundredWay'
        : 'uniref'
  // A residue or a preset family waits for InterPro to say which seed it
  // opens, rather than loading the 100-way to discard it.
  const familyPending =
    regionsLoading &&
    (focus?.kind === 'residue' || (focusChoice === undefined && !!preset?.pfam))
  const partnerPending =
    partnersLoading && focusChoice === undefined && !!preset?.partner

  // Only the seed alignment is keyed on the domain instance and the residue it
  // marks, since both are baked into its placed rows.
  const residueFocus = focus?.kind === 'residue' ? focus.position : 0
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
          ...(source === 'pfam'
            ? [family?.pfam ?? '', family?.start ?? 0, residueFocus]
            : []),
        ] as const)
      : null,
    ([, sym, , src]) => {
      const orthologs = () =>
        hundredWay
          ? loadHundredWay(sym)
          : Promise.resolve(loadUniref(structure))
      switch (src) {
        case 'hundredWay':
          return loadHundredWay(sym)
        case 'uniref':
          return Promise.resolve(loadUniref(structure))
        case 'pfam':
          // A seed the translation cannot be placed in fails the same way
          // every time, so the session takes the orthologs and says why.
          return family
            ? loadPfam(structure, family, focus).catch(async (e: unknown) => {
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

  // what the map and a typed residue are numbered on: the canonical, else
  // the last InterPro region's end
  const proteinLength =
    canonical?.length ??
    (regions?.length ? Math.max(...regions.map(r => r.end)) : undefined)

  return (
    <>
      <ProteinLaunchCard
        structure={structure}
        isoform={isoform}
        onIsoform={name => {
          setIsoformName(name)
          setLaunchParam(
            'isoform',
            name === structure.transcript.name ? undefined : name,
          )
        }}
        alignment={alignment}
        aligning={aligning || familyPending}
        alignmentError={error}
        onRetryAlignment={() => {
          void retry()
        }}
        focus={focus}
        partnerPending={partnerPending}
        focusPending={partnerPending || familyPending}
        onFocus={setFocus}
        structurePick={linkPicks?.structure}
        proteinLength={proteinLength}
        onStructure={id => {
          setLaunchParam('structure', id)
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
              accession={uniprotId}
              length={proteinLength ?? 0}
              regions={regions}
              partners={partnersState}
              onLoadPartners={() => {
                if (wantPartners) {
                  void retryPartners()
                } else {
                  setWantPartners(true)
                }
              }}
              focus={focus}
              onFocus={setFocus}
            />
          )}
        </section>
      )}

      <p className="ui-hint">
        <a href={geneUrl('/gene/', symbol, taxId)}>
          {symbol} gene page — orthologs and conserved gene order →
        </a>
      </p>
    </>
  )
}
