import '../styles/ui.css'

import { useCallback, useMemo } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import {
  ALL_SOURCES,
  chooseSecondAssembly,
  createStaticCatalog,
  pickDefaultTrack,
} from '../lib/syntenyCatalog.ts'
import { assemblyOptions, availableExamples } from '../lib/syntenyExamples.ts'
import syntenyTracksUrl from '../syntenyTracks.json?url'
import Autocomplete from './Autocomplete.tsx'
import OpenInDesktop from './OpenInDesktop.tsx'
import {
  encodeGeneRef,
  geneWindow,
  parseGeneRef,
  queryGenes,
  resolveGenePair,
} from './geneSearch.ts'
import { flipLoc, panelTracks, syntenyViewUrl } from './jbrowseLinks.ts'
import { loadStore } from './orthologDb.ts'

import type { SyntenyCatalogData } from '../lib/syntenyCatalog.ts'
import type { SyntenyExample } from '../lib/syntenyExamples.ts'
import type { ReactNode } from 'react'

interface Props {
  data: SyntenyCatalogData
}

// The catalog is a static asset rather than island props: serialized into the
// page it was ~950 KB of inline HTML, fetched it is one cacheable file.
export default function SyntenySelector() {
  const { data, error } = useSWRImmutable(syntenyTracksUrl, (url: string) =>
    fetchJson<SyntenyCatalogData>(url),
  )
  return data ? (
    <SyntenyPicker data={data} />
  ) : (
    <p className="synteny-hint">
      {error
        ? `Could not load the synteny catalog (${String(error)}).`
        : 'Loading the synteny catalog…'}
    </p>
  )
}

function SyntenyPicker({ data }: Props) {
  // Everything that makes the link shareable is URL state: the pair, the gene
  // (as "<NCBI GeneID>:<symbol>", so a load can re-resolve the ortholog without
  // a search).
  const [species1Param, setSpecies1] = useUrlState('assembly', '')
  const [species2Param, setSpecies2] = useUrlState('assembly2', '')
  const [geneValue, setGeneValue] = useUrlState('gene', '')

  const catalog = useMemo(() => createStaticCatalog(data), [data])
  const filter = ALL_SOURCES
  const nameOf = (id: string) => data.assemblyInfo[id]?.commonName ?? id

  // Every list is a filter over the blob the page already handed us, so it is
  // derived during render rather than mirrored into state by an effect. The
  // URL is validated the same way: a link naming an assembly the catalog does
  // not list reads as nothing chosen, rather than a half-selected pair, and a
  // first assembly with one partner has that partner as its second. The page
  // still names a link's assembly2 that the lone partner replaced.
  const assemblies = useMemo(
    () => catalog.listAssemblies(filter),
    [catalog, filter],
  )
  const species1 = assemblies.some(a => a.id === species1Param)
    ? species1Param
    : ''
  const partners = useMemo(
    () => (species1 ? catalog.listPartners(species1, filter) : []),
    [catalog, species1, filter],
  )
  const species2 = chooseSecondAssembly(partners, species2Param)
  const unknownParams = [
    [species1Param, species1],
    [species2Param, species2],
  ]
    .filter(([param, chosen]) => param && param !== chosen)
    .map(([param]) => param)
  const tracks = useMemo(
    () =>
      species1 && species2
        ? catalog.listTracks(species1, species2, filter)
        : [],
    [catalog, species1, species2, filter],
  )

  const taxon1 = data.assemblyInfo[species1]?.taxonId
  const taxon2 = data.assemblyInfo[species2]?.taxonId
  // The gene is searched in the first assembly's taxon, so the box shows as
  // soon as that has one: the gene page links here with a gene and no partner.
  const canSearchGenes = taxon1 !== undefined
  const gene = canSearchGenes ? parseGeneRef(geneValue) : undefined

  // The gene and its ortholog in the second taxon, keyed on exactly the inputs
  // they answer for: a response for an earlier gene or partner can never land
  // on the current pair, and a failed request is an error rather than "no
  // ortholog".
  const pair = useSWRImmutable(
    gene && taxon1 !== undefined && taxon2 !== undefined
      ? (['gene-pair', gene.geneId, taxon1, taxon2] as const)
      : null,
    async ([, geneId, t1, t2]) => {
      const [genes, store] = await Promise.all([
        resolveGenePair(geneId, t1, t2),
        loadStore().catch(() => undefined),
      ])
      return { ...genes, store }
    },
    LIVE_QUERY,
  )
  const sameTaxon = taxon1 === taxon2
  const ortholog = pair.data?.ortholog
  const symbol2 = gene && sameTaxon ? gene.symbol : ortholog?.symbol

  function orthologNote(): ReactNode {
    if (!gene || taxon2 === undefined) {
      return ''
    }
    if (pair.isLoading) {
      return sameTaxon
        ? `Finding ${gene.symbol}…`
        : `Finding ${gene.symbol} ortholog in ${nameOf(species2)}…`
    }
    if (pair.error !== undefined) {
      return (
        <>
          {`${sameTaxon ? 'Gene' : 'Ortholog'} lookup failed (${String(pair.error)}). `}
          The view will open without{' '}
          {sameTaxon ? 'the gene’s neighborhood' : 'the ortholog'}.{' '}
          <button
            type="button"
            className="ui-linkbtn"
            onClick={() => {
              void pair.mutate()
            }}
          >
            Retry
          </button>
        </>
      )
    }
    if (sameTaxon) {
      return ''
    }
    return ortholog
      ? `${gene.symbol} → ${ortholog.symbol}`
      : `No ${gene.symbol} ortholog in ${nameOf(species2)}.`
  }
  // Gene-name typeahead in the first assembly's taxon. Each option carries the
  // NCBI gene id so selection can resolve the ortholog in the second taxon —
  // so a suggestion mygene holds without one is dropped rather than offered as
  // a choice that could not resolve. A failed search rejects, and the box shows
  // it as the error it was rather than as "no gene by that name".
  const queryGeneOptions = useCallback(
    async (search: string) => {
      const hits = taxon1 === undefined ? [] : await queryGenes(search, taxon1)
      return {
        options: hits.flatMap(h =>
          h.geneId
            ? [{ value: encodeGeneRef(h.geneId, h.symbol), label: h.symbol }]
            : [],
        ),
      }
    },
    [taxon1],
  )

  const handleSpecies1Change = (value: string) => {
    setSpecies1(value)
    setSpecies2('')
    setGeneValue('')
  }

  // The gene is searched in the first assembly's taxon, so a new partner keeps
  // it; the gene page links here with the gene and no partner.
  const handleSpecies2Change = (value: string) => {
    setSpecies2(value)
  }

  // Within one taxon the gene is the same in both assemblies. Across taxa the
  // ortholog becomes the gene of the new first assembly; with none resolved
  // there is nothing to carry over.
  const handleSwap = () => {
    setSpecies1(species2)
    setSpecies2(species1)
    if (!sameTaxon) {
      setGeneValue(
        ortholog ? encodeGeneRef(ortholog.gene_id, ortholog.symbol) : '',
      )
    }
  }

  const examples = useMemo(
    () => availableExamples(catalog, filter),
    [catalog, filter],
  )

  const handleExample = (example: SyntenyExample) => {
    setSpecies1(example.assembly)
    setSpecies2(example.assembly2)
    setGeneValue(example.gene ?? '')
  }

  // Swapping the pair switches to the set netted on the new first assembly.
  const selectedTrack = pickDefaultTrack(tracks, species1)

  // A gene launch opens each panel on its gene's neighborhood where NCBI placed
  // the gene on that very assembly, and on the bare symbol otherwise (an old
  // UCSC build), which JBrowse resolves through the assembly's text index. The
  // second panel is flipped when its gene runs the other way. `sameScale` stays
  // off: on `main` it zoomed both TP53 panels out to whole chromosomes
  // (2026-10-08). A panel with no locus is the whole genome, where a gene track
  // only opens a "Requested too much data" banner, so it opens none. The launch
  // waits for the lookup, since those fallbacks open a different view than the
  // one it settles on. See SyntenyViewOptions for which hosts honour the view
  // options.
  const store = pair.data?.store
  const window1 =
    store && pair.data?.gene
      ? geneWindow(pair.data.gene, species1, store)
      : undefined
  const window2 =
    store && ortholog ? geneWindow(ortholog, species2, store) : undefined
  const loc1 = window1?.loc ?? gene?.symbol
  const loc2 = window2
    ? flipLoc(
        window2.loc,
        window1 !== undefined && window1.strand !== window2.strand,
      )
    : symbol2
  const panel = (assembly: string, loc: string | undefined) =>
    loc
      ? {
          assembly,
          loc,
          ...panelTracks(data.assemblyInfo[assembly]?.geneTrack ?? ''),
        }
      : { assembly }
  const launchUrl =
    species1 && species2 && selectedTrack && !pair.isLoading
      ? syntenyViewUrl(
          [panel(species1, loc1), panel(species2, loc2)],
          [selectedTrack.trackId],
          {
            color: { field: 'query' },
            drawCurves: true,
            autoDiagonalize: !(window1 && window2),
          },
        )
      : null

  const species1Options = useMemo(
    () => assemblyOptions(assemblies),
    [assemblies],
  )
  const species2Options = useMemo(() => assemblyOptions(partners), [partners])

  return (
    <div className="synteny-selector">
      {examples.length > 0 && (
        <div
          className="synteny-examples"
          role="group"
          aria-label="Example comparisons"
        >
          Try
          {examples.map(example => (
            <button
              key={example.label}
              type="button"
              className="ui-linkbtn"
              onClick={() => {
                handleExample(example)
              }}
            >
              {example.label}
            </button>
          ))}
        </div>
      )}

      <div className="synteny-pair">
        <div className="synteny-field">
          <label htmlFor="species1">First assembly</label>
          <Autocomplete
            id="species1"
            options={species1Options}
            value={species1}
            onChange={value => {
              handleSpecies1Change(value)
            }}
            placeholder={`Type to search ${assemblies.length} assemblies…`}
          />
        </div>

        {species1 && species2 ? (
          <button
            type="button"
            className="synteny-swap"
            onClick={() => {
              handleSwap()
            }}
            aria-label="Swap assemblies"
            title="Swap"
          >
            ⇄
          </button>
        ) : (
          <span className="synteny-swap-slot" />
        )}

        <div className="synteny-field">
          <label htmlFor="species2">Second assembly</label>
          <Autocomplete
            id="species2"
            options={species2Options}
            value={species2}
            onChange={value => {
              handleSpecies2Change(value)
            }}
            placeholder={
              species1
                ? `Type to search ${partners.length} comparable assemblies…`
                : 'Choose a first assembly'
            }
            disabled={!species1}
          />
        </div>
      </div>

      {unknownParams.length > 0 && (
        <p className="synteny-hint">
          Ignored {unknownParams.map(p => `“${p}”`).join(' and ')} from the
          link: not an assembly with a synteny comparison.
        </p>
      )}

      {canSearchGenes && (
        <div className="synteny-field synteny-gene">
          <label htmlFor="gene">Center on gene</label>
          <Autocomplete
            id="gene"
            key={`gene-${species1}`}
            options={gene ? [{ value: geneValue, label: gene.symbol }] : []}
            queryOptions={queryGeneOptions}
            value={geneValue}
            onChange={value => {
              setGeneValue(value)
            }}
            placeholder={`Whole genome (or search a ${nameOf(species1)} gene)…`}
          />
          <div
            className="synteny-gene-note"
            aria-live="polite"
          >
            {orthologNote()}
          </div>
        </div>
      )}

      <div className="synteny-actions">
        {launchUrl ? (
          <>
            <a
              href={launchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn"
            >
              Open synteny view →
            </a>
            <OpenInDesktop
              className="ui-btn-secondary"
              webUrl={launchUrl}
            />
          </>
        ) : (
          <button
            className="ui-btn"
            disabled
          >
            Open synteny view →
          </button>
        )}
      </div>
    </div>
  )
}
