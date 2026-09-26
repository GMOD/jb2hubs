import '../styles/ui.css'

import { useCallback, useMemo, useState } from 'react'

import useSWRImmutable from 'swr/immutable'

import { useUrlState } from '../hooks/useUrlState.ts'
import { fetchJson } from '../lib/fetchJson.ts'
import { createStaticCatalog, pickDefaultTrack } from '../lib/syntenyCatalog.ts'
import syntenyTracksUrl from '../syntenyTracks.json?url'
import Autocomplete from './Autocomplete.tsx'
import OpenInDesktop from './OpenInDesktop.tsx'
import {
  encodeGeneRef,
  parseGeneRef,
  queryGenes,
  resolveOrthologSymbol,
} from './geneSearch.ts'
import { panelTracks, syntenyViewUrl } from './jbrowseLinks.ts'

import type {
  SyntenyAssembly,
  SyntenyCatalogData,
} from '../lib/syntenyCatalog.ts'
import type { ReactNode } from 'react'

interface Props {
  data: SyntenyCatalogData
}

function formatOption(asm: SyntenyAssembly) {
  const parts = [asm.displayName]
  if (asm.scientificName && asm.scientificName !== asm.displayName) {
    parts.push(asm.scientificName)
  }
  parts.push(asm.id)
  return parts.join('  ·  ')
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
  // Gene centering is offered whenever both assemblies map to an NCBI taxon.
  const canSearchGenes = taxon1 !== undefined && taxon2 !== undefined
  const gene = canSearchGenes ? parseGeneRef(geneValue) : undefined

  // The orthologous symbol in the second taxon, keyed on exactly the inputs it
  // answers for: a response for an earlier gene or partner can never land on
  // the current pair, and a failed request is an error rather than "no
  // ortholog". A same-species pair reuses the symbol and asks nothing.
  const ortholog = useSWRImmutable(
    gene && taxon2 !== undefined && taxon1 !== taxon2
      ? (['ortholog', gene.geneId, taxon2] as const)
      : null,
    ([, geneId, taxId]) => resolveOrthologSymbol(geneId, taxId),
  )
  const symbol2 = gene
    ? taxon1 === taxon2
      ? gene.symbol
      : ortholog.data
    : undefined

  function orthologNote(): ReactNode {
    let note: ReactNode = ''
    if (gene && taxon1 !== taxon2) {
      if (ortholog.isLoading) {
        note = `Finding ${gene.symbol} ortholog in ${nameOf(species2)}…`
      } else if (ortholog.error !== undefined) {
        note = (
          <>
            Ortholog lookup failed ({String(ortholog.error)}).{' '}
            <button
              type="button"
              className="ui-linkbtn"
              onClick={() => {
                void ortholog.mutate()
              }}
            >
              Retry
            </button>
          </>
        )
      } else if (ortholog.data) {
        note = `${gene.symbol} → ${ortholog.data}`
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

  const handleSpecies1Change = (value: string) => {
    setSpecies1(value)
    setSpecies2('')
    setTrackOverride('')
    setGeneValue('')
  }

  // The gene is searched in the first assembly's taxon, so a new partner keeps
  // it; the gene page links here with the gene and no partner.
  const handleSpecies2Change = (value: string) => {
    setSpecies2(value)
    setTrackOverride('')
  }

  const handleSwap = () => {
    setSpecies1(species2)
    setSpecies2(species1)
    setTrackOverride('')
    setGeneValue('')
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

  // Each panel opens its genome's gene track — a synteny sub-view has no
  // defaultSession, so without one it is an empty browser at the right locus —
  // and is navigated to its gene's symbol where it has one, which JBrowse
  // resolves through the assembly's text index at load: the first panel as soon
  // as a gene is picked, the second once its ortholog resolves. Otherwise the
  // whole genome. The view options make the whole-genome synteny readable on
  // first load (chromosome painting, diagonalized axes, bezier ribbons); see
  // SyntenyViewOptions for which hosts honour them.
  const panel = (assembly: string, loc: string | undefined) => ({
    assembly,
    ...(loc ? { loc } : {}),
    ...panelTracks(data.assemblyInfo[assembly]?.geneTrack ?? ''),
  })
  const launchUrl =
    species1 && species2 && selectedTrack
      ? syntenyViewUrl(
          [panel(species1, gene?.symbol), panel(species2, symbol2)],
          [selectedTrack.trackId],
          {
            color: { field: 'query' },
            drawCurves: true,
            autoDiagonalize: true,
          },
        )
      : null

  const species1Options = useMemo(
    () =>
      assemblies.map(asm => ({
        value: asm.id,
        label: formatOption(asm),
      })),
    [assemblies],
  )

  const species2Options = useMemo(
    () =>
      partners.map(asm => ({
        value: asm.id,
        label: formatOption(asm),
      })),
    [partners],
  )

  return (
    <div className="synteny-selector">
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
            placeholder="Search species or accession…"
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
                ? 'Search comparable species…'
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
          } a synteny comparison with ${nameOf(species1)}.`}
        {species1 && species2 && (
          <span>
            Comparing <strong>{nameOf(species1)}</strong> ⇄{' '}
            <strong>{nameOf(species2)}</strong>
          </span>
        )}
      </div>

      {canSearchGenes && (
        <div className="synteny-field synteny-gene">
          <label htmlFor="gene">Center on orthologous gene (optional)</label>
          <Autocomplete
            id="gene"
            key={`gene-${species1}-${species2}`}
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
