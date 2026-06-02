import React, { useEffect, useMemo, useState } from 'react'

import Autocomplete from './Autocomplete.tsx'
import { createStaticCatalog, pickDefaultTrack } from '../lib/syntenyCatalog.ts'

import type {
  SyntenyAssembly,
  SyntenyCatalogData,
  SyntenyTrackSummary,
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
  const [species1, setSpecies1] = useState('')
  const [species2, setSpecies2] = useState('')
  const [trackOverride, setTrackOverride] = useState('')
  const [showUcsc, setShowUcsc] = useState(true)
  const [showGenark, setShowGenark] = useState(true)

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

  const handleSpecies1Change = (value: string) => {
    setSpecies1(value)
    setSpecies2('')
  }

  const handleSwap = () => {
    setSpecies1(species2)
    setSpecies2(species1)
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

    const sessionSpec = {
      views: [
        {
          type: 'LinearSyntenyView',
          tracks: [selectedTrack.trackId],
          views: [{ assembly: species1 }, { assembly: species2 }],
        },
      ],
    }

    return `https://jbrowse.org/code/jb2/main/?config=${encodeURIComponent(mergeApiUrl)}&session=spec-${encodeURIComponent(JSON.stringify(sessionSpec))}`
  }, [species1, species2, selectedTrack])

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
            onChange={handleSpecies1Change}
            placeholder="Search species or accession…"
          />
        </div>

        <button
          type="button"
          className="synteny-swap"
          onClick={handleSwap}
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
            onChange={setSpecies2}
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
