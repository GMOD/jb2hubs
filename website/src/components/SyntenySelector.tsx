import { useMemo, useState } from 'react'

import { useUrlState } from '../hooks/useUrlState.ts'
import { createStaticCatalog, pickDefaultTrack } from '../lib/syntenyCatalog.ts'
import Autocomplete from './Autocomplete.tsx'
import OpenInDesktop from './OpenInDesktop.tsx'
import { fetchOrthologSymbol, searchGenes } from './geneSearch.ts'
import { syntenyViewUrl } from './jbrowseLinks.ts'

import type {
  SyntenyAssembly,
  SyntenyCatalogData,
} from '../lib/syntenyCatalog.ts'

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

export default function SyntenySelector({ data }: Props) {
  const [species1, setSpecies1] = useUrlState('assembly', '')
  const [species2, setSpecies2] = useUrlState('assembly2', '')
  const [trackOverride, setTrackOverride] = useState('')
  const [showUcsc, setShowUcsc] = useState(true)
  const [showGenark, setShowGenark] = useState(true)
  // The gene chosen in the Autocomplete, encoded as "<geneId>\t<symbol>" (its
  // option value). Drives display + ortholog resolution.
  const [geneValue, setGeneValue] = useState('')
  // The resolved ortholog pair as "species1Symbol\tspecies2Symbol", used to
  // navigate each sub-view at launch. Empty = whole genome.
  const [selectedGene, setSelectedGene] = useState('')
  // Status under the gene box while resolving / when no ortholog exists.
  const [geneNote, setGeneNote] = useState('')

  const catalog = useMemo(() => createStaticCatalog(data), [data])
  const filter = useMemo(
    () => ({ ucsc: showUcsc, genark: showGenark }),
    [showUcsc, showGenark],
  )
  const nameOf = (id: string) => data.assemblyInfo[id]?.commonName ?? id

  // Every list is a filter over the blob the page already handed us, so it is
  // derived during render rather than mirrored into state by an effect.
  const assemblies = useMemo(
    () => catalog.listAssemblies(filter),
    [catalog, filter],
  )
  const partners = useMemo(
    () => (species1 ? catalog.listPartners(species1, filter) : []),
    [catalog, species1, filter],
  )
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

  const resetGene = () => {
    setGeneValue('')
    setSelectedGene('')
    setGeneNote('')
  }

  // Gene-name typeahead in the first assembly's taxon. Each option carries the
  // NCBI gene id so selection can resolve the ortholog in the second taxon —
  // so a suggestion mygene holds without one is dropped rather than offered as
  // a choice that could not resolve.
  const queryGeneOptions = async (search: string) =>
    taxon1 !== undefined
      ? (await searchGenes(search, taxon1))
          .filter(h => h.geneId)
          .map(h => ({
            value: `${h.geneId}\t${h.symbol}`,
            label: h.symbol,
          }))
      : []

  // On selection, resolve the orthologous symbol in the second taxon (or reuse
  // the same symbol for same-species pairs) so the launch can center both views.
  const handleGeneChange = (value: string) => {
    setGeneValue(value)
    const [geneId, symbol1] = value.split('\t')
    if (!geneId || !symbol1 || taxon2 === undefined) {
      setSelectedGene('')
      setGeneNote('')
    } else if (taxon1 === taxon2) {
      setSelectedGene(`${symbol1}\t${symbol1}`)
      setGeneNote('')
    } else {
      setSelectedGene('')
      setGeneNote(`Finding ${symbol1} ortholog in ${nameOf(species2)}…`)
      void fetchOrthologSymbol(geneId, taxon2)
        .then(symbol2 => {
          if (symbol2) {
            setSelectedGene(`${symbol1}\t${symbol2}`)
            setGeneNote(`${symbol1} → ${symbol2}`)
          } else {
            setGeneNote(`No ${symbol1} ortholog in ${nameOf(species2)}.`)
          }
        })
        .catch(() => {
          setGeneNote('Ortholog lookup failed; try again.')
        })
    }
  }

  const handleSpecies1Change = (value: string) => {
    setSpecies1(value)
    setSpecies2('')
    resetGene()
  }

  const handleSpecies2Change = (value: string) => {
    setSpecies2(value)
    resetGene()
  }

  const handleSwap = () => {
    setSpecies1(species2)
    setSpecies2(species1)
    resetGene()
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
      setSpecies1('')
      setSpecies2('')
      resetGene()
    } else if (
      species2 &&
      !catalog.listPartners(species1, next).some(a => a.id === species2)
    ) {
      setSpecies2('')
      resetGene()
    }
  }

  // A track override left over from a previous pair isn't in this pair's list,
  // so it falls back to the default rather than leaving the launch disabled —
  // which is why changing the pair needs no reset.
  const selectedTrack = useMemo(
    () =>
      tracks.find(t => t.trackId === trackOverride) ??
      pickDefaultTrack(tracks, species1) ??
      null,
    [tracks, trackOverride, species1],
  )

  const launchUrl = useMemo(() => {
    if (!species1 || !species2 || !selectedTrack) {
      return null
    }

    // The LinearSyntenyView LaunchView extension point reads these top-level
    // spec fields into its one-time init block. They make the whole-genome
    // synteny readable on first load: chromosome painting instead of grey
    // mud, diagonalized axes, and bezier ribbons. Deployments that predate
    // these options ignore the extra fields.
    // When a gene is chosen, navigate each sub-view to the orthologous gene
    // symbol; JBrowse resolves the symbol to a locus via each assembly's text
    // search index at load. A whole-genome view (no loc) otherwise. selectedGene
    // encodes both symbols as "species1Symbol\tspecies2Symbol".
    const [gene1, gene2] = selectedGene.split('\t')
    const subViews =
      gene1 && gene2
        ? [
            { assembly: species1, loc: gene1 },
            { assembly: species2, loc: gene2 },
          ]
        : [{ assembly: species1 }, { assembly: species2 }]

    return syntenyViewUrl(subViews, [selectedTrack.trackId], {
      colorBy: 'query',
      drawCurves: true,
      autoDiagonalize: true,
    })
  }, [species1, species2, selectedTrack, selectedGene])

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

      <div className="synteny-hint">
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
            queryOptions={queryGeneOptions}
            value={geneValue}
            onChange={value => {
              handleGeneChange(value)
            }}
            placeholder={`Whole genome (or search a ${nameOf(species1)} gene)…`}
          />
          {geneNote && <div className="synteny-gene-note">{geneNote}</div>}
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
