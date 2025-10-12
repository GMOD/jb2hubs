'use client'
import React, { useEffect, useState } from 'react'
import PhylogeneticTreeVirtualized from './PhylogeneticTreeVirtualized'

interface SpeciesData {
  accession: string
  commonName?: string
  scientificName?: string
  ncbiRefSeqCategory?: string
  suppressed?: boolean
  [key: string]: any
}

interface ClientOnlyPhylogeneticTreeProps {
  category?: string
  speciesData?: SpeciesData[]
}

export default function ClientOnlyPhylogeneticTree({
  category = 'all',
  speciesData = [],
}: ClientOnlyPhylogeneticTreeProps) {
  const [newickData, setNewickData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTree, setShowTree] = useState(false)

  useEffect(() => {
    if (!showTree) return
    async function fetchData() {
      try {
        const phylogenyPath = `/phylogeny/${category}.newick`
        const response = await fetch(phylogenyPath)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.text()
        setNewickData(data)
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message)
        } else {
          setError('An unknown error occurred')
        }
      }
    }

    fetchData()
  }, [showTree, category])

  if (!showTree) {
    return (
      <button onClick={() => setShowTree(true)}>
        Show phylogenetic tree
      </button>
    )
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 rounded">
        <h3 className="text-red-800 font-semibold">Error loading phylogenetic tree</h3>
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  if (!newickData) {
    return (
      <div className="p-4 border border-gray-300 bg-gray-50 rounded">
        <p>Loading phylogenetic tree...</p>
      </div>
    )
  }

  return (
    <PhylogeneticTreeVirtualized
      newickData={newickData}
      speciesData={speciesData}
      width={1200}
      height={800}
    />
  )
}
