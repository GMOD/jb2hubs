import fs from 'fs'
import path from 'path'

interface ChainTrack {
  type: string
  trackId: string
  name: string
  category: string[]
  assemblyNames: string[]
  adapter: {
    type: string
    targetAssembly: string
    queryAssembly: string
    pifGzLocation: { uri: string }
    index: { location: { uri: string }; indexType?: string }
  }
}

interface JBrowseConfig {
  tracks: ChainTrack[]
  [key: string]: unknown
}

interface MetaJson {
  accession: string
  scientificName: string
  commonName: string
  [key: string]: unknown
}

/**
 * Reads a JSON file and parses its content.
 * @param filePath The path to the JSON file.
 * @returns The parsed JSON object.
 */
function readJSON<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

/**
 * Writes a JSON object to a file.
 * @param filePath The path to the file to write.
 * @param data The data to write as JSON.
 */
function writeJSON(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

/**
 * Parses a PIF filename to extract the target assembly name.
 * Handles various formats:
 * - XToY format: GCA_031761385.1ToGCF_041296265.1
 * - X.Y format: Col-CEN_v1.2.GCF_000001735.4_TAIR10.1
 * @param filename The PIF filename (without .pif.gz extension).
 * @returns The target assembly name, or null if parsing fails.
 */
function parseTargetAssemblyFromFilename(filename: string): string | null {
  // Try XToY format first
  let match = /^(.+?)To(.+?)$/.exec(filename)
  if (!match?.[1] || !match[2]) {
    // Try X.Y format (dot-separated)
    match = /^(.+?)\.(.+?)$/.exec(filename)
    if (!match?.[1] || !match[2]) {
      return null
    }
  }
  return match[2]
}

/**
 * Normalizes assembly names by converting capitalized UCSC names to lowercase.
 * Examples: Hg38 -> hg38, Mm39 -> mm39
 * GCF/GCA accessions are returned unchanged.
 * @param assemblyName The assembly name to normalize.
 * @returns The normalized assembly name.
 */
function normalizeAssemblyName(assemblyName: string): string {
  if (assemblyName.startsWith('GCF') || assemblyName.startsWith('GCA')) {
    return assemblyName
  }
  // Convert first letter to lowercase for typical UCSC assembly names
  return assemblyName.charAt(0).toLowerCase() + assemblyName.slice(1)
}

/**
 * Gets the display/common name for a target assembly.
 * For GCF/GCA accessions, looks in processedHubJson/all.json.
 * For UCSC assemblies, looks in ucsc2jbrowse/configs/{assembly}.json.
 * @param targetAssembly The normalized target assembly name.
 * @param isGenArkAccession Whether the target is a GCF/GCA accession.
 * @returns The common/display name, or empty string if not found.
 */
function getTargetCommonName(
  targetAssembly: string,
  isGenArkAccession: boolean,
): string {
  if (isGenArkAccession) {
    // For GCF/GCA accessions, look in processedHubJson/all.json
    try {
      const allJsonPath = path.join(
        process.cwd(),
        '../website/processedHubJson/all.json',
      )
      const allJson = JSON.parse(fs.readFileSync(allJsonPath, 'utf8'))
      const assembly = allJson.find((a: any) => a?.accession === targetAssembly)
      return assembly?.commonName ?? ''
    } catch (error) {
      // Silent failure - common name just won't be available
      return ''
    }
  } else {
    // For typical UCSC assemblies, try to get displayName from ucsc2jbrowse configs
    try {
      const ucscConfigPath = path.join(
        process.cwd(),
        '../ucsc2jbrowse/configs',
        `${targetAssembly}.json`,
      )
      if (fs.existsSync(ucscConfigPath)) {
        const ucscConfig = JSON.parse(fs.readFileSync(ucscConfigPath, 'utf8'))
        return ucscConfig.assemblies?.[0]?.displayName ?? ''
      }
      return ''
    } catch (error) {
      // Silent failure - common name just won't be available
      return ''
    }
  }
}

/**
 * Creates a chain track configuration object from a PIF file.
 * @param pifFile The name of the PIF file (e.g., 'GCA_031761385.1ToGCF_041296265.1.pif.gz').
 * @param sourceAccession The source assembly accession (e.g., 'GCA_031761385.1').
 * @param sourceCommonName The common name of the source assembly.
 * @returns A ChainTrack object or null if parsing fails.
 */
function createChainTrackConfig({
  pifFile,
  sourceAccession,
  sourceCommonName,
}: {
  pifFile: string
  sourceAccession: string
  sourceCommonName: string
}): ChainTrack | null {
  const filename = path.basename(pifFile)
  const filenameWithoutExt = filename.replace('.pif.gz', '')

  const targetAssemblyOrig = parseTargetAssemblyFromFilename(filenameWithoutExt)
  if (!targetAssemblyOrig) {
    console.warn(`Warning: Could not parse filename format for ${filename}`)
    return null
  }

  // Normalize assembly name (lowercase for UCSC assemblies, unchanged for GCF/GCA)
  const targetAssembly = normalizeAssemblyName(targetAssemblyOrig)
  const isGenArkAccession =
    targetAssemblyOrig.startsWith('GCF') || targetAssemblyOrig.startsWith('GCA')
  const targetCommonName = getTargetCommonName(
    targetAssembly,
    isGenArkAccession,
  )

  const trackId = `${sourceAccession}_to_${targetAssembly}_liftOver`
  const trackName = targetCommonName
    ? `${sourceAccession} (${sourceCommonName}) to ${targetCommonName} liftOver`
    : `${sourceAccession} to ${targetAssembly} liftOver`

  return {
    type: 'SyntenyTrack',
    trackId,
    name: trackName,
    category: ['Pairwise alignments', 'liftOver'],
    assemblyNames: [sourceAccession, targetAssembly],
    adapter: {
      type: 'PairwiseIndexedPAFAdapter',
      targetAssembly: sourceAccession,
      queryAssembly: targetAssembly,
      pifGzLocation: { uri: `liftOver/${filename}` },
      index: {
        location: { uri: `liftOver/${filename}.csi` },
        indexType: 'CSI',
      },
    },
  }
}

/**
 * Main function to update the JBrowse configuration with chain tracks.
 * It reads PIF files from the liftOver directory and adds corresponding
 * SyntenyTrack entries to the config.json.
 */
function main() {
  const metaPath = process.argv[2]

  if (!metaPath) {
    console.error('Usage: node createChainTracks.ts <path_to_meta.json>')
    process.exit(1)
  }

  if (!fs.existsSync(metaPath)) {
    console.error(`Error: meta.json not found at ${metaPath}`)
    process.exit(1)
  }

  const configDir = path.dirname(metaPath)
  const configFile = path.join(configDir, 'config.json')

  // Ensure config file exists
  if (!fs.existsSync(configFile)) {
    console.warn(`Warning: config.json not found at ${configFile}, skipping`)
    return
  }

  const liftOverDir = path.join(configDir, 'liftOver')
  if (!fs.existsSync(liftOverDir)) {
    // No liftOver directory, nothing to do
    return
  }

  const pifFiles = fs
    .readdirSync(liftOverDir)
    .filter(file => file.endsWith('.pif.gz'))

  if (pifFiles.length === 0) {
    // No PIF files found, nothing to do
    return
  }

  // Read meta.json to get source assembly info
  const meta = readJSON<MetaJson>(metaPath)
  const sourceAccession = meta.accession
  const sourceCommonName = meta.commonName || meta.scientificName

  const chainTracks: ChainTrack[] = []

  for (const pifFile of pifFiles) {
    const track = createChainTrackConfig({
      pifFile,
      sourceAccession,
      sourceCommonName,
    })
    if (track) {
      chainTracks.push(track)
    }
  }

  if (chainTracks.length === 0) {
    return
  }

  const config = readJSON<JBrowseConfig>(configFile)

  // Deduplicate tracks by trackId to avoid adding duplicates if script is run
  // multiple times
  const existingTrackIds = new Set(config.tracks.map(t => t.trackId))

  writeJSON(configFile, {
    ...config,
    tracks: [
      ...config.tracks,
      ...chainTracks.filter(t => !existingTrackIds.has(t.trackId)),
    ],
  })

  if (chainTracks.filter(t => !existingTrackIds.has(t.trackId)).length > 0) {
    console.log(
      `Added ${chainTracks.filter(t => !existingTrackIds.has(t.trackId)).length} chain tracks to ${configFile}`,
    )
  }
}

main()
