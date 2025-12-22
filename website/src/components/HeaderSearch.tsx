import React, { useMemo, useState } from 'react'
import Autocomplete, { type AutocompleteOption } from './Autocomplete'
import allData from '../processedHubJson/all.json'

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: '#999' }}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

interface SpeciesData {
  accession: string
  scientificName: string
  commonName: string
  taxonId: number
}

export default function HeaderSearch() {
  const [selectedValue, setSelectedValue] = useState('')

  const searchOptions: AutocompleteOption[] = useMemo(() => {
    const options: AutocompleteOption[] = []
    const seen = new Set<string>()

    for (const item of allData as SpeciesData[]) {
      const { accession, scientificName, commonName, taxonId } = item

      if (accession && !seen.has(accession)) {
        seen.add(accession)
        options.push({
          value: accession,
          label: `${accession} - ${scientificName}${commonName ? ` (${commonName})` : ''}`,
        })
      }

      if (scientificName && !seen.has(`sci:${scientificName}`)) {
        seen.add(`sci:${scientificName}`)
        options.push({
          value: accession,
          label: `${scientificName}${commonName ? ` (${commonName})` : ''} - ${accession}`,
        })
      }

      if (taxonId && !seen.has(`tax:${taxonId}`)) {
        seen.add(`tax:${taxonId}`)
        options.push({
          value: accession,
          label: `Taxonomy ID: ${taxonId} - ${scientificName} - ${accession}`,
        })
      }
    }

    return options
  }, [])

  const handleChange = (value: string) => {
    setSelectedValue(value)
    if (value) {
      window.location.href = `/accession/${value}`
    }
  }

  return (
    <div className="header-search">
      <div style={{ position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            left: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <SearchIcon />
        </div>
        <div style={{ paddingLeft: '28px' }}>
          <Autocomplete
            options={searchOptions}
            value={selectedValue}
            onChange={handleChange}
            placeholder="Search species, accession, or taxonomy ID..."
            id="header-search-input"
          />
        </div>
      </div>
    </div>
  )
}
