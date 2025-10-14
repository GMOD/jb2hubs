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
  autoShow?: boolean
  title?: string
  hubsLink?: string
}

export default function ClientOnlyPhylogeneticTree({
  category = 'all',
  speciesData = [],
  autoShow = false,
  title,
  hubsLink,
}: ClientOnlyPhylogeneticTreeProps) {
  const [newickData, setNewickData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTree, setShowTree] = useState(autoShow)

  useEffect(() => {
    if (!showTree) return
    async function fetchData() {
      try {
        const taxonomyPath = `/taxonomy/${category}.newick`
        const response = await fetch(taxonomyPath)
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
    return <button onClick={() => setShowTree(true)}>Show taxonomy</button>
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 rounded">
        <h3 className="text-red-800 font-semibold">Error loading taxonomy</h3>
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  if (!newickData) {
    return (
      <div className="p-4 border border-gray-300 bg-gray-50 rounded">
        <p>Loading taxonomy...</p>
      </div>
    )
  }

  const header =
    title && hubsLink ? (
      <>
        <h1 style={{ margin: 0 }}>GenArk taxonomy - {title}</h1>
        <a
          href={hubsLink}
          style={{ color: '#2563eb', textDecoration: 'underline' }}
        >
          View list of species as table for {title}
        </a>
      </>
    ) : undefined

  return (
    <PhylogeneticTreeVirtualized
      newickData={newickData}
      speciesData={speciesData}
      height={800}
      header={header}
    />
  )
}
