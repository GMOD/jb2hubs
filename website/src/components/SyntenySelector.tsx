import React, { useMemo, useState } from 'react'

import Autocomplete from './Autocomplete'

interface SyntenyTrack {
  trackId: string
  name: string
  assemblyNames: string[]
}

interface AssemblyInfo {
  commonName?: string
  scientificName?: string
  source: 'ucsc' | 'genark' | 'legacy'
}

interface Props {
  syntenyTracks: SyntenyTrack[]
  assemblyInfo: Record<string, AssemblyInfo>
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
      <img src={favicon} alt={sourceLabels[source]} className="source-icon" />
    )
  }
  return <span>{sourceTextIcons[source] || ''}</span>
}

export default function SyntenySelector({
  syntenyTracks,
  assemblyInfo,
}: Props) {
  const [species1, setSpecies1] = useState('')
  const [species2, setSpecies2] = useState('')
  const [selectedTrackId, setSelectedTrackId] = useState('')
  const [showUcsc, setShowUcsc] = useState(true)
  const [showGenark, setShowGenark] = useState(true)

  const launchableTracks = useMemo(() => {
    return syntenyTracks.filter(track =>
      track.assemblyNames.every(name => {
        const info = assemblyInfo[name]
        if (!info || info.source === 'legacy') {
          return false
        }
        if (info.source === 'ucsc' && !showUcsc) {
          return false
        }
        if (info.source === 'genark' && !showGenark) {
          return false
        }
        return true
      }),
    )
  }, [syntenyTracks, assemblyInfo, showUcsc, showGenark])

  const { sortedAssemblies, assemblyPairs } = useMemo(() => {
    const allAssemblies = new Set<string>()
    const pairs = new Map<string, Set<string>>()

    for (const track of launchableTracks) {
      for (const assembly of track.assemblyNames) {
        allAssemblies.add(assembly)
      }
      if (track.assemblyNames.length === 2) {
        const [first, second] = track.assemblyNames as [string, string]
        if (!pairs.has(first)) {
          pairs.set(first, new Set())
        }
        pairs.get(first)!.add(second)
        if (!pairs.has(second)) {
          pairs.set(second, new Set())
        }
        pairs.get(second)!.add(first)
      }
    }

    const sorted = Array.from(allAssemblies)
      .map(id => {
        const info = assemblyInfo[id]
        return {
          id,
          displayName: info?.commonName || id,
          scientificName: info?.scientificName || '',
          source: info?.source || 'legacy',
        }
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName))

    return { sortedAssemblies: sorted, assemblyPairs: pairs }
  }, [launchableTracks, assemblyInfo])

  const availableSpecies2 = useMemo(() => {
    if (!species1) {
      return []
    }
    const available = assemblyPairs.get(species1) || new Set()
    return Array.from(available)
      .map(id => {
        const info = assemblyInfo[id]
        return {
          id,
          displayName: info?.commonName || id,
          scientificName: info?.scientificName || '',
          source: info?.source || 'legacy',
        }
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [species1, assemblyPairs, assemblyInfo])

  const matchingTracks = useMemo(() => {
    if (!species1 || !species2) {
      return []
    }
    return launchableTracks.filter(
      track =>
        track.assemblyNames.includes(species1) &&
        track.assemblyNames.includes(species2),
    )
  }, [species1, species2, launchableTracks])

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
    return matchingTracks.find(t => t.trackId === selectedTrackId) || null
  }, [selectedTrackId, matchingTracks])

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

  const formatOption = (asm: {
    id: string
    displayName: string
    scientificName: string
    source: string
  }) => {
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

  const species1Options = useMemo(
    () =>
      sortedAssemblies.map(asm => ({
        value: asm.id,
        label: formatOption(asm),
      })),
    [sortedAssemblies],
  )

  const species2Options = useMemo(
    () =>
      availableSpecies2.map(asm => ({
        value: asm.id,
        label: formatOption(asm),
      })),
    [availableSpecies2],
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
          {availableSpecies2.length} species available for comparison
        </div>
      )}

      {matchingTracks.length > 0 && (
        <div className="species-group track-selector">
          <label htmlFor="track">Synteny Track:</label>
          <select
            id="track"
            value={selectedTrackId}
            onChange={handleTrackChange}
            autoComplete="off"
          >
            <option value="">-- Select a track --</option>
            {matchingTracks.map(track => (
              <option key={track.trackId} value={track.trackId}>
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
