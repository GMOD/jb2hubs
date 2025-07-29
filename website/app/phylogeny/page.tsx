import fs from 'fs'
import path from 'path'
import PhylogeneticTree from '../components/PhylogeneticTree'

function getNewickData(): string | null {
  try {
    const newickPath = path.join(process.cwd(), 'public', 'phylogeny.newick')
    const newickData = fs.readFileSync(newickPath, 'utf-8')
    return newickData.trim()
  } catch (error) {
    console.error('Error reading Newick file:', error)
    return null
  }
}

export default function PhylogenyPage() {
  const newickData = getNewickData()

  if (!newickData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Phylogenetic Tree</h1>
        <div className="bg-red-50 border border-red-300 p-4 rounded-lg">
          <h3 className="text-red-800 font-semibold mb-2">
            Error Loading Tree
          </h3>
          <p className="text-red-600">
            Phylogenetic tree data not found. Please ensure the phylogeny.newick
            file exists in the public directory.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Phylogenetic Tree</h1>

      <div className="mb-6">
        <p className="text-gray-600 mb-4">
          This phylogenetic tree shows the evolutionary relationships between
          species in the genome database. Click on any leaf node (blue circles)
          to view detailed information about that accession.
        </p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        {newickData && (
          <PhylogeneticTree newickData={newickData} width={1200} height={800} />
        )}
      </div>

      <div className="mt-6 text-sm text-gray-500">
        <p>
          Tree generated from NCBI taxonomy data using taxonomic relationships.
          Each leaf node represents a genome assembly with its accession number.
        </p>
      </div>
    </div>
  )
}

