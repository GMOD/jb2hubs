import '../styles/ui.css'

import { useCallback, useMemo, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { createStaticCatalog, pickDefaultTrack } from '../lib/syntenyCatalog.ts'
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
  // a search) and an alignment other than the default.
  const [species1Param, setSpecies1] = useUrlState('assembly', '')
  const [species2Param, setSpecies2] = useUrlState('assembly2', '')
  const [geneValue, setGeneValue] = useUrlState('gene', '')
  const [trackOverride, setTrackOverride] = useUrlState('track', '')
  const [showUcsc, setShowUcsc] = useState(true)
  const [showGenark, setShowGenark] = useState(true)

  const catalog = useMemo(() => createStaticCatalog(data), [data])
  const filter = useMemo(
    () => ({ ucsc: showUcsc, genark: showGenark }),
    [showUcsc, showGenark],
  )
  const nameOf = (id: string) => data.assemblyInfo[id]?.commonName ?? id
  // Human is hg38 and hs1, Mouse is mm10 and mm39: the id says which was picked.
  const labelOf = (id: string) =>
    nameOf(id) === id ? id : `${nameOf(id)} (${id})`

  // Every list is a filter over the blob the page already handed us, so it is
  // derived during render rather than mirrored into state by an effect. The
  // URL is validated the same way: a link naming an assembly the catalog does
  // not list reads as nothing chosen, rather than a half-selected pair.
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
  const species2 = partners.some(a => a.id === species2Param)
    ? species2Param
    : ''
  const unknownParams = [
    [species1Param, species1],
    [species2Param, species2],
  ]
    .filter(([param, valid]) => param && !valid)
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
  )
  const sameTaxon = taxon1 === taxon2
  const ortholog = pair.data?.ortholog
  const symbol2 = gene && sameTaxon ? gene.symbol : ortholog?.symbol

  function orthologNote(): ReactNode {
    let note: ReactNode = ''
    if (gene && taxon2 !== undefined && !sameTaxon) {
      if (pair.isLoading) {
        note = `Finding ${gene.symbol} ortholog in ${nameOf(species2)}…`
      } else if (pair.error !== undefined) {
        note = (
          <>
            Ortholog lookup failed ({String(pair.error)}).{' '}
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
      } else if (ortholog) {
        note = `${gene.symbol} → ${ortholog.symbol}`
      } else {
        note = `No ${gene.symbol} ortholog in ${nameOf(species2)}.`
      }
    }
    return note
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

  // Over half the listed assemblies have exactly one partner, which is then
  // picked for the reader.
  const handleSpecies1Change = (value: string) => {
    const only = value ? catalog.listPartners(value, filter) : []
    setSpecies1(value)
    setSpecies2(only.length === 1 ? only[0]!.id : '')
    setTrackOverride('')
    setGeneValue('')
  }

  // The gene is searched in the first assembly's taxon, so a new partner keeps
  // it; the gene page links here with the gene and no partner.
  const handleSpecies2Change = (value: string) => {
    setSpecies2(value)
    setTrackOverride('')
  }

  // The ortholog becomes the gene of the new first assembly; with none
  // resolved there is nothing to carry over.
  const handleSwap = () => {
    setSpecies1(species2)
    setSpecies2(species1)
    setTrackOverride('')
    setGeneValue(
      ortholog ? encodeGeneRef(ortholog.gene_id, ortholog.symbol) : '',
    )
  }

  const examples = useMemo(
    () => availableExamples(catalog, filter),
    [catalog, filter],
  )

  const handleExample = (example: SyntenyExample) => {
    setSpecies1(example.assembly)
    setSpecies2(example.assembly2)
    setTrackOverride('')
    setGeneValue(example.gene ?? '')
  }

  // Unticking a source can strip the current selection out of the lists it was
  // picked from, so the pair is re-validated here, where the change happens,
  // rather than by an effect watching the lists afterwards.
  const setSources = (ucsc: boolean, genark: boolean) => {
    setShowUcsc(ucsc)
    setShowGenark(genark)
    const next = { ucsc, genark }
    if (
      species1 &&
      !catalog.listAssemblies(next).some(a => a.id === species1)
    ) {
      handleSpecies1Change('')
    } else if (
      species2 &&
      !catalog.listPartners(species1, next).some(a => a.id === species2)
    ) {
      handleSpecies2Change('')
    }
  }

  // An override that is not in this pair's list (a hand-edited link) falls
  // back to the default rather than leaving the launch disabled.
  const selectedTrack = useMemo(
    () =>
      tracks.find(t => t.trackId === trackOverride) ??
      pickDefaultTrack(tracks, species1) ??
      null,
    [tracks, trackOverride, species1],
  )

  // A gene launch opens each panel on its gene's neighborhood where NCBI placed
  // the gene on that very assembly, and on the bare symbol otherwise (an old
  // UCSC build, or before the report arrives), which JBrowse resolves through
  // the assembly's text index to the gene body alone. Both panels share one
  // scale, and the second is flipped when its gene runs the other way. A panel
  // with no locus is the whole genome, where a gene track only opens a
  // "Requested too much data" banner, so it opens none. The view options make
  // the whole-genome synteny readable on first load (chromosome painting,
  // diagonalized axes, bezier ribbons); see SyntenyViewOptions for which hosts
  // honour them.
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
  const viewOptions = {
    color: { field: 'query' },
    drawCurves: true,
    autoDiagonalize: true,
    ...(gene ? { sameScale: true } : {}),
  }
  const launchUrl =
    species1 && species2 && selectedTrack
      ? syntenyViewUrl(
          [panel(species1, loc1), panel(species2, loc2)],
          [selectedTrack.trackId],
          viewOptions,
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
          <span className="ui-caption">Examples:</span>
          {examples.map(example => (
            <button
              key={example.label}
              type="button"
              className="ui-chip-btn"
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

        <button
          type="button"
          className="synteny-swap"
          onClick={() => {
            handleSwap()
          }}
          disabled={!species1 || !species2}
          aria-label="Swap assemblies"
          title="Swap"
        >
          ⇄
        </button>

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

      <div
        className="synteny-hint"
        aria-live="polite"
      >
        {unknownParams.length > 0 && (
          <span>
            Ignored {unknownParams.map(p => `“${p}”`).join(' and ')} from the
            link: not an assembly with a synteny comparison.{' '}
          </span>
        )}
        {!species1 && 'Pick two assemblies to compare their synteny.'}
        {species1 &&
          !species2 &&
          `${partners.length} ${
            partners.length === 1 ? 'assembly has' : 'assemblies have'
          } a synteny comparison with ${nameOf(species1)}.${
            gene ? ` Pick one and the view will center on ${gene.symbol}.` : ''
          }`}
        {species1 && species2 && (
          <span>
            Comparing <strong>{labelOf(species1)}</strong> ⇄{' '}
            <strong>{labelOf(species2)}</strong>
          </span>
        )}
      </div>

      {canSearchGenes && (
        <div className="synteny-field synteny-gene">
          <label htmlFor="gene">Center on orthologous gene (optional)</label>
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
              className="synteny-launch"
            >
              Open synteny view →
            </a>
            <OpenInDesktop
              className="synteny-launch synteny-launch-secondary"
              webUrl={launchUrl}
            />
          </>
        ) : (
          <button
            className="synteny-launch"
            disabled
          >
            Open synteny view →
          </button>
        )}
      </div>

      <details className="synteny-options">
        <summary>Options</summary>
        <div className="synteny-options-body">
          {tracks.length > 1 && (
            <div className="synteny-option">
              <label htmlFor="track">Alignment</label>
              <select
                id="track"
                value={selectedTrack?.trackId ?? ''}
                onChange={e => {
                  setTrackOverride(e.target.value)
                }}
              >
                {tracks.map(track => (
                  <option
                    key={track.trackId}
                    value={track.trackId}
                  >
                    {track.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="synteny-option">
            <span>Sources</span>
            <label className="synteny-source">
              <input
                type="checkbox"
                checked={showUcsc}
                onChange={e => {
                  setSources(e.target.checked, showGenark)
                }}
              />
              UCSC
            </label>
            <label className="synteny-source">
              <input
                type="checkbox"
                checked={showGenark}
                onChange={e => {
                  setSources(showUcsc, e.target.checked)
                }}
              />
              NCBI/GenArk
            </label>
          </div>
        </div>
      </details>
    </div>
  )
}
