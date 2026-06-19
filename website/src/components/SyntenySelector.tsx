import React, { useEffect, useMemo, useState } from 'react'

import Autocomplete from './Autocomplete.tsx'
import { createStaticCatalog, pickDefaultTrack } from '../lib/syntenyCatalog.ts'
import { StaticFileOrthologAdapter } from '../orthologs/orthologAdapter.ts'

import type {
  SyntenyAssembly,
  SyntenyCatalogData,
  SyntenyTrackSummary,
} from '../lib/syntenyCatalog.ts'

interface Props {
  data: SyntenyCatalogData
  // Canonical "<loTax>_<hiTax>" keys with a cross-species ortholog table, and
  // taxon ids with a same-species gene table, under website/public/orthologs/.
  // Drive the optional gene-level comparison. Built by orthologs/make.sh.
  orthologPairs?: string[]
  orthologTaxa?: number[]
}

// JBrowse Web build the synteny views launch into. The launch spec sets
// LinearSyntenyView init options (colorBy/drawCurves/autoDiagonalize) read by
// the LaunchView extension point; builds predating them ignore the extra fields.
const JBROWSE_BASE = 'https://jbrowse.org/code/jb2/main'

function formatOption(asm: SyntenyAssembly) {
  const parts = [asm.displayName]
  if (asm.scientificName && asm.scientificName !== asm.displayName) {
    parts.push(asm.scientificName)
  }
  parts.push(asm.id)
  return parts.join('  ·  ')
}

export default function SyntenySelector({
  data,
  orthologPairs = [],
  orthologTaxa = [],
}: Props) {
  const [species1, setSpecies1] = useState('')
  const [species2, setSpecies2] = useState('')
  const [trackOverride, setTrackOverride] = useState('')
  const [showUcsc, setShowUcsc] = useState(true)
  const [showGenark, setShowGenark] = useState(true)
  // The chosen ortholog, encoded as "species1Symbol\tspecies2Symbol" so the
  // launch can navigate each sub-view to its symbol. Empty = whole genome.
  const [selectedGene, setSelectedGene] = useState('')

  // Stable, non-React data layer for the ortholog tables. Swappable for a
  // REST/tabix-backed adapter without touching this component.
  const [orthologAdapter] = useState(
    () => new StaticFileOrthologAdapter(orthologPairs, orthologTaxa),
  )

  const [assemblies, setAssemblies] = useState<SyntenyAssembly[]>([])
  const [partners, setPartners] = useState<SyntenyAssembly[]>([])
  const [tracks, setTracks] = useState<SyntenyTrackSummary[]>([])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const a1 = params.get('assembly')
    const a2 = params.get('assembly2')
    if (a1) {
      setSpecies1(a1)
    }
    if (a1 && a2) {
      setSpecies2(a2)
    }
  }, [])

  const catalog = useMemo(() => createStaticCatalog(data), [data])
  const filter = useMemo(
    () => ({ ucsc: showUcsc, genark: showGenark }),
    [showUcsc, showGenark],
  )
  const nameOf = (id: string) => data.assemblyInfo[id]?.commonName ?? id

  useEffect(() => {
    let active = true
    void catalog.listAssemblies(filter).then(result => {
      if (active) {
        setAssemblies(result)
        if (species1 && !result.some(a => a.id === species1)) {
          setSpecies1('')
          setSpecies2('')
        }
      }
    })
    return () => {
      active = false
    }
  }, [catalog, filter, species1])

  useEffect(() => {
    let active = true
    if (species1) {
      void catalog.listPartners(species1, filter).then(result => {
        if (active) {
          setPartners(result)
          if (species2 && !result.some(a => a.id === species2)) {
            setSpecies2('')
          }
        }
      })
    } else {
      setPartners([])
    }
    return () => {
      active = false
    }
  }, [catalog, species1, species2, filter])

  useEffect(() => {
    let active = true
    if (species1 && species2) {
      void catalog.listTracks(species1, species2, filter).then(result => {
        if (active) {
          setTracks(result)
          setTrackOverride('')
        }
      })
    } else {
      setTracks([])
      setTrackOverride('')
    }
    return () => {
      active = false
    }
  }, [catalog, species1, species2, filter])

  const taxon1 = data.assemblyInfo[species1]?.taxonId
  const taxon2 = data.assemblyInfo[species2]?.taxonId
  const hasOrthologs =
    taxon1 !== undefined &&
    taxon2 !== undefined &&
    orthologAdapter.hasPair(taxon1, taxon2)

  // Database-like gene query handed to the gene Autocomplete. The adapter owns
  // fetching, orientation, dedupe, and fuzzy ranking; here we just shape the
  // result into options whose value carries both symbols for the launch loc.
  const queryGeneOptions = async (search: string) => {
    let opts: { value: string; label: string }[] = []
    if (taxon1 !== undefined && taxon2 !== undefined) {
      const rows = await orthologAdapter.queryGenes({
        taxon1,
        taxon2,
        search,
      })
      opts = rows.map(r => ({
        value: `${r.gene1}\t${r.gene2}`,
        label: `${r.gene1} → ${r.gene2}`,
      }))
    }
    return opts
  }

  const handleSpecies1Change = (value: string) => {
    setSpecies1(value)
    setSpecies2('')
    setSelectedGene('')
  }

  const handleSpecies2Change = (value: string) => {
    setSpecies2(value)
    setSelectedGene('')
  }

  const handleSwap = () => {
    setSpecies1(species2)
    setSpecies2(species1)
    setSelectedGene('')
  }

  const selectedTrack = useMemo(() => {
    if (tracks.length === 0) {
      return null
    }
    if (trackOverride) {
      return tracks.find(t => t.trackId === trackOverride) ?? null
    }
    return pickDefaultTrack(tracks, species1)
  }, [tracks, trackOverride, species1])

  const launchUrl = useMemo(() => {
    if (!species1 || !species2 || !selectedTrack) {
      return null
    }

    const mergeApiUrl = `https://0hifvzakej.execute-api.us-east-1.amazonaws.com/merge?hubIds=${species1},${species2}`

    // The LinearSyntenyView LaunchView extension point reads these top-level
    // spec fields into its one-time init block. They make the whole-genome
    // synteny readable on first load: chromosome painting instead of grey
    // mud, diagonalized axes, and bezier ribbons. Deployments that predate
    // these options ignore the extra fields.
    // When a gene is chosen, navigate each sub-view to the orthologous gene
    // symbol; JBrowse resolves the symbol to a locus via each assembly's text
    // search index at load. A whole-genome view (no loc) otherwise. selectedGene
    // encodes both symbols as "species1Symbol\tspecies2Symbol".
    const [gene1, gene2] = hasOrthologs ? selectedGene.split('\t') : []
    const subViews =
      gene1 && gene2
        ? [
            { assembly: species1, loc: gene1 },
            { assembly: species2, loc: gene2 },
          ]
        : [{ assembly: species1 }, { assembly: species2 }]

    const sessionSpec = {
      views: [
        {
          type: 'LinearSyntenyView',
          tracks: [selectedTrack.trackId],
          views: subViews,
          colorBy: 'query',
          drawCurves: true,
          autoDiagonalize: true,
        },
      ],
    }

    return `${JBROWSE_BASE}/?config=${encodeURIComponent(mergeApiUrl)}&session=spec-${encodeURIComponent(JSON.stringify(sessionSpec))}`
  }, [species1, species2, selectedTrack, selectedGene, hasOrthologs])

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
            onChange={value => handleSpecies1Change(value)}
            placeholder="Search species or accession…"
          />
        </div>

        <button
          type="button"
          className="synteny-swap"
          onClick={() => handleSwap()}
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
            onChange={value => handleSpecies2Change(value)}
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

      {hasOrthologs && (
        <div className="synteny-field synteny-gene">
          <label htmlFor="gene">Center on orthologous gene (optional)</label>
          <Autocomplete
            id="gene"
            key={`gene-${species1}-${species2}`}
            queryOptions={queryGeneOptions}
            value={selectedGene}
            onChange={value => setSelectedGene(value)}
            placeholder="Whole genome (or search a gene)…"
          />
        </div>
      )}

      <div className="synteny-actions">
        {launchUrl ? (
          <a
            href={launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="synteny-launch"
          >
            Open synteny view →
          </a>
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
                onChange={() => {
                  setShowUcsc(!showUcsc)
                }}
              />
              UCSC
            </label>
            <label className="synteny-source">
              <input
                type="checkbox"
                checked={showGenark}
                onChange={() => {
                  setShowGenark(!showGenark)
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
