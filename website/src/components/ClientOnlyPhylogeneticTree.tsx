'use client'
import React, { useEffect, useState } from 'react'
import PhylogeneticTreeVirtualized from './PhylogeneticTreeVirtualized'

export default function ClientOnlyPhylogeneticTree() {
  const [newickData, setNewickData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTree, setShowTree] = useState(false)

  useEffect(() => {
    if (!showTree) return
    async function fetchData() {
      try {
        const response = await fetch('/phylogeny.newick')
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
  }, [showTree])

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
    <PhylogeneticTreeVirtualized newickData={newickData} width={1200} height={800} />
  )
}
