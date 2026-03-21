import fs from 'fs'
import path from 'path'

/**
 * @typedef {object} AssemblyData
 * @property {string} accession
 * @property {string} scientificName
 * @property {string} ncbiAssemblyName
 * @property {string} commonName
 * @property {string} jbrowseLink
 * @property {string} igvBrowserLink
 * @property {string} ncbiBrowserLink
 * @property {string} ucscBrowserLink
 * @property {string} ucscDataLink
 * @property {string} ncbiLink
 * @property {number} taxonId
 * // Add other properties of AssemblyData if known and needed for type safety
 * [key: string]: any; // Allow other properties
 */

export interface AssemblyData {
  accession: string
  scientificName: string
  ncbiAssemblyName: string
  commonName: string
  jbrowseLink: string
  igvBrowserLink: string
  ncbiBrowserLink: string
  ucscBrowserLink: string
  ucscDataLink: string
  ncbiLink: string
  taxonId: number
  seqReleaseDate?: string
  assemblyStatus?: string
  assemblyType?: string
  submitterOrg?: string
  suppressed?: boolean
  ncbiRefSeqCategory?: string
  stats?: Record<string, unknown>
  pairedAccession?: string
  pairedAssemblyStatus?: string
  pairedAssemblyDifferences?: string
  genomeNotes?: string[]
  suppressionReason?: string
  infraspecificNames?: Record<string, string>
  comments?: string
  gcPercent?: number
  genomeCoverage?: string
  sequencingTech?: string
  bioprojectAccession?: string
  annotationInfo?: {
    name?: string
    provider?: string
    release_date?: string
    stats?: {
      gene_counts?: {
        protein_coding?: number
        non_coding?: number
        pseudogene?: number
        total?: number
      }
    }
  }
  [key: string]: any // Allow other properties
}

let accessionMap: Map<string, AssemblyData> | null = null

/**
 * Loads and caches the accession data from all.json.
 * @returns {Map<string, AssemblyData>}
 */
export function loadAccessionMap(): Map<string, AssemblyData> {
  accessionMap ??= new Map(
    JSON.parse(
      fs.readFileSync(path.join('processedHubJson', 'all.json'), 'utf-8'),
    )
      .filter((f: AssemblyData) => f.accession)
      .map((f: AssemblyData) => [f.accession, f]),
  )
  return accessionMap
}

/**
 * Safely reads and parses a JSON file.
 * @template T
 * @param {string} filePath
 * @returns {Promise<T | null>}
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function tryAndReadJSON<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch (error) {
    // console.error(`Error reading or parsing JSON from ${filePath}:`, error);
    return null
  }
}
