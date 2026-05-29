import React, { useEffect, useMemo, useState } from 'react'

import Autocomplete from './Autocomplete.tsx'
import { createStaticCatalog } from '../lib/syntenyCatalog.ts'

import type {
  SyntenyAssembly,
  SyntenyCatalogData,
  SyntenyTrackSummary,
} from '../lib/syntenyCatalog.ts'

interface Props {
  data: SyntenyCatalogData
}

const sourceFavicons: Record<string, string> = {
  ucsc: 'https://genome.ucsc.edu/favicon.ico',
  genark: 'https://www.ncbi.nlm.nih.gov/favicon.ico',
}

const sourceTextIcons: Record<string, string> = {
  ucsc: '[UCSC]',
  genark: '[NCBI]',
  legacy: '[Legacy]',
}

const sourceLabels: Record<string, string> = {
  ucsc: 'UCSC',
  genark: 'NCBI/GenArk',
  legacy: 'Legacy (unavailable)',
}

function SourceIcon({ source }: { source: string }) {
  const favicon = sourceFavicons[source]
  if (favicon) {
    return (
      <img
        src={favicon}
        alt={sourceLabels[source]}
        className="source-icon"
      />
    )
  }
  return <span>{sourceTextIcons[source] ?? ''}</span>
}

function formatOption(asm: SyntenyAssembly) {
  const parts: string[] = []

  const textIcon = sourceTextIcons[asm.source]
  if (textIcon) {
    parts.push(textIcon)
  }

  if (asm.displayName && asm.displayName !== asm.id) {
    parts.push(asm.displayName)
  }

  if (asm.scientificName) {
    parts.push(`(${asm.scientificName})`)
  }

  parts.push(`[${asm.id}]`)

  return parts.join(' ')
}

export default function SyntenySelector({ data }: Props) {
  const [species1, setSpecies1] = useState('')
  const [species2, setSpecies2] = useState('')
  const [selectedTrackId, setSelectedTrackId] = useState('')
  const [showUcsc, setShowUcsc] = useState(true)
  const [showGenark, setShowGenark] = useState(true)

  const [assemblies, setAssemblies] = useState<SyntenyAssembly[]>([])
  const [partners, setPartners] = useState<SyntenyAssembly[]>([])
  const [tracks, setTracks] = useState<SyntenyTrackSummary[]>([])

  const catalog = useMemo(() => createStaticCatalog(data), [data])
  const filter = useMemo(
    () => ({ ucsc: showUcsc, genark: showGenark }),
    [showUcsc, showGenark],
  )

  useEffect(() => {
    let active = true
    catalog.listAssemblies(filter).then(result => {
      if (active) {
        setAssemblies(result)
      }
    })
    return () => {
      active = false
    }
  }, [catalog, filter])

  useEffect(() => {
    let active = true
    if (species1) {
      catalog.listPartners(species1, filter).then(result => {
        if (active) {
          setPartners(result)
        }
      })
    } else {
      setPartners([])
    }
    return () => {
      active = false
    }
  }, [catalog, species1, filter])

  useEffect(() => {
    let active = true
    if (species1 && species2) {
      catalog.listTracks(species1, species2, filter).then(result => {
        if (active) {
          setTracks(result)
        }
      })
    } else {
      setTracks([])
    }
    return () => {
      active = false
    }
  }, [catalog, species1, species2, filter])

  const handleSpecies1Change = (value: string) => {
    setSpecies1(value)
    setSpecies2('')
    setSelectedTrackId('')
  }

  const handleSpecies2Change = (value: string) => {
    setSpecies2(value)
    setSelectedTrackId('')
  }

  const handleTrackChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTrackId(e.target.value)
  }

  const selectedTrack = useMemo(() => {
    if (!selectedTrackId) {
      return null
    }
    return tracks.find(t => t.trackId === selectedTrackId) ?? null
  }, [selectedTrackId, tracks])

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

  const handleFilterChange = (source: 'ucsc' | 'genark') => {
    if (source === 'ucsc') {
      setShowUcsc(!showUcsc)
    } else {
      setShowGenark(!showGenark)
    }
    setSpecies1('')
    setSpecies2('')
    setSelectedTrackId('')
  }

  return (
    <div className="synteny-selector">
      <div className="source-legend">
        <label className="legend-item">
          <input
            type="checkbox"
            checked={showUcsc}
            onChange={() => {
              handleFilterChange('ucsc')
            }}
          />
          <SourceIcon source="ucsc" /> {sourceLabels.ucsc}
        </label>
        <label className="legend-item">
          <input
            type="checkbox"
            checked={showGenark}
            onChange={() => {
              handleFilterChange('genark')
            }}
          />
          <SourceIcon source="genark" /> {sourceLabels.genark}
        </label>
      </div>

      <div className="species-selection">
        <div className="species-group">
          <label htmlFor="species1">First Species:</label>
          <Autocomplete
            id="species1"
            options={species1Options}
            value={species1}
            onChange={handleSpecies1Change}
            placeholder="Search species..."
          />
        </div>

        <div className="species-group">
          <label htmlFor="species2">Second Species:</label>
          <Autocomplete
            id="species2"
            options={species2Options}
            value={species2}
            onChange={handleSpecies2Change}
            placeholder={
              species1 ? 'Search species...' : 'Select first species first'
            }
            disabled={!species1}
          />
        </div>
      </div>

      {species1 && (
        <div className="status-text">
          {partners.length} species available for comparison
        </div>
      )}

      {tracks.length > 0 && (
        <div className="species-group track-selector">
          <label htmlFor="track">Synteny Track:</label>
          <select
            id="track"
            value={selectedTrackId}
            onChange={handleTrackChange}
            autoComplete="off"
          >
            <option value="">-- Select a track --</option>
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

      <div className="button-group">
        {launchUrl ? (
          <a
            href={launchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="launch-link"
          >
            Launch Synteny View
          </a>
        ) : (
          <button disabled>Launch Synteny View</button>
        )}
      </div>
    </div>
  )
}
