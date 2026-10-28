import '../styles/ui.css'

import { useCallback, useMemo } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { LIVE_QUERY } from '../lib/swr.ts'
import {
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
import { panelTracks, syntenyViewUrl } from './jbrowseLinks.ts'
import { loadStore } from './orthologDb.ts'
import { placePanels } from './panelPlacement.ts'

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
  // URL state makes the link shareable: the pair, and the gene as
  // "<NCBI GeneID>:<symbol>" so a load re-resolves the ortholog without a search.
  const [species1Param, setSpecies1] = useUrlState('assembly', '')
  const [species2Param, setSpecies2] = useUrlState('assembly2', '')
  const [geneValue, setGeneValue] = useUrlState('gene', '')

  const catalog = useMemo(() => createStaticCatalog(data), [data])
  const nameOf = (id: string) => data.assemblyInfo[id]?.commonName ?? id

  // Every list is a filter over the fetched catalog, so it is derived during
  // render rather than mirrored into state by an effect. The URL is validated
  // the same way: a link naming an assembly the catalog does not list reads as
  // nothing chosen, rather than a half-selected pair, and a first assembly with
  // one partner has that partner as its second. The page still names a link's
  // assembly2 that the lone partner replaced.
  const assemblies = useMemo(() => catalog.listAssemblies(), [catalog])
  const species1 = assemblies.some(a => a.id === species1Param)
    ? species1Param
    : ''
  const partners = useMemo(
    () => (species1 ? catalog.listPartners(species1) : []),
    [catalog, species1],
  )
  const species2 = chooseSecondAssembly(partners, species2Param)
  const listed2 = assemblies.some(a => a.id === species2Param)
    ? species2Param
    : ''
  const unknownParams = [
    [species1Param, species1],
    [species2Param, species1 ? species2 : listed2],
  ]
    .filter(([param, chosen]) => param && param !== chosen)
    .map(([param]) => param)
  const tracks = useMemo(
    () => (species1 && species2 ? catalog.listTracks(species1, species2) : []),
    [catalog, species1, species2],
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
        loadStore(),
      ])
      return { ...genes, store }
    },
    LIVE_QUERY,
  )
  const sameTaxon = taxon1 === taxon2
  const ortholog = pair.data?.ortholog

  // The searched gene sits on the panel of its own taxon, which after a swap is
  // the second. The view waits for the lookup, since the fallbacks open a
  // different view than the one it settles on. A panel with no locus is the
  // whole genome, where a gene track only opens a "Requested too much data"
  // banner, so it opens none.
  const store = pair.data?.store
  const searchedGene = pair.data?.gene
  const pairIds = [species1, species2]
  const taxa = [taxon1, taxon2]
  const geneTaxon = searchedGene ? Number(searchedGene.tax_id) : taxon1
  const searchedRow = Math.max(0, taxa.indexOf(geneTaxon))
  const plan = placePanels(
    pairIds.map((assembly, i) => {
      const ncbi = taxa[i] === geneTaxon ? searchedGene : ortholog
      return {
        window: store && ncbi ? geneWindow(ncbi, assembly, store) : undefined,
        symbol: i === searchedRow ? gene?.symbol : undefined,
        searched: gene !== undefined && i === searchedRow,
      }
    }),
  )
  const alignedRow = plan.panels.findIndex(p => p.placement === 'alignment')
  const alignedId = pairIds[alignedRow] ?? ''

  function orthologNote(): ReactNode {
    if (!gene || taxon2 === undefined) {
      return ''
    }
    if (pair.isLoading) {
      return sameTaxon
        ? `Finding ${gene.symbol}…`
        : `Finding ${gene.symbol} ortholog…`
    }
    if (pair.error !== undefined) {
      return (
        <>
          {`${sameTaxon ? 'Gene' : 'Ortholog'} lookup failed (${String(pair.error)}). `}
          {alignedId
            ? `${nameOf(alignedId)} will be placed by alignment.`
            : 'The view will open without the gene’s neighborhood.'}{' '}
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
    if (alignedId) {
      return ortholog
        ? `${nameOf(alignedId)}: ${ortholog.symbol} not on ${alignedId} · placed by alignment`
        : `${nameOf(alignedId)}: no NCBI ortholog · placed by alignment`
    }
    return ortholog ? `${gene.symbol} → ${ortholog.symbol}` : ''
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

  // The gene stays, and its panel moves with it.
  const handleSwap = () => {
    setSpecies1(species2)
    setSpecies2(species1)
  }

  const examples = useMemo(() => availableExamples(catalog), [catalog])

  const handleExample = (example: SyntenyExample) => {
    setSpecies1(example.assembly)
    setSpecies2(example.assembly2)
    setGeneValue(example.gene ?? '')
  }

  // Swapping the pair switches to the set netted on the new first assembly.
  const selectedTrack = pickDefaultTrack(tracks, species1)

  // `sameScale` stays off: on `main` it zoomed both TP53 panels out to whole
  // chromosomes (2026-10-08). See SyntenyViewOptions for which hosts honour the
  // view options.
  const panels = plan.panels.map(({ loc, placement }, i) => {
    const assembly = pairIds[i] ?? ''
    return placement === 'none'
      ? { assembly }
      : {
          assembly,
          ...(loc ? { loc } : {}),
          ...panelTracks(data.assemblyInfo[assembly]?.geneTrack ?? ''),
        }
  })
  const launchUrl =
    species1 && species2 && selectedTrack && !pair.isLoading
      ? syntenyViewUrl(panels, [selectedTrack.trackId], {
          encoding: { color: { field: 'query' } },
          mark: { interpolate: 'bump' },
          ...(plan.followAnchor === undefined
            ? {
                autoDiagonalize: plan.panels.some(p => p.placement !== 'gene'),
              }
            : {
                followSynteny: true,
                followAnchorIndex: plan.followAnchor,
                followMatchOrientation: true,
              }),
        })
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
