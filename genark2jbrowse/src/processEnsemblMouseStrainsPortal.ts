import fs from 'fs'

import { JAX_STRAIN_IDS, jaxUrl } from './jaxStrainIds.ts'

// Ensembl Mouse Genomes Project assemblies with their GCA accessions and strain names
// https://projects.ensembl.org/mouse_genomes/
const ENSEMBL_MOUSE_STRAINS = [
  { accession: 'GCA_964188535.1', strain: 'C57BL/6J (T2T)' },
  { accession: 'GCA_964188545.1', strain: 'CAST/EiJ (T2T)' },
  { accession: 'GCA_921999865.2', strain: 'C57BL/6NJ' },
  { accession: 'GCA_947593165.1', strain: 'NZO/HlLtJ' },
  { accession: 'GCA_921997145.2', strain: 'BALB/cJ' },
  { accession: 'GCA_921998635.2', strain: 'FVB/NJ' },
  { accession: 'GCA_921998555.2', strain: '129S1/SvImJ' },
  { accession: 'GCA_921997125.2', strain: 'C3H/HeJ' },
  { accession: 'GCA_922000895.2', strain: 'AKR/J' },
  { accession: 'GCA_921998315.2', strain: 'DBA/2J' },
  { accession: 'GCA_921998355.2', strain: 'A/J' },
  { accession: 'GCA_947599735.1', strain: 'LP/J' },
  { accession: 'GCA_921998325.2', strain: 'NOD/ShiLtJ' },
  { accession: 'GCA_921998905.2', strain: 'CBA/J' },
  { accession: 'GCA_921999005.2', strain: 'CAST/EiJ' },
  { accession: 'GCA_921998345.2', strain: 'WSB/EiJ' },
  { accession: 'GCA_921999095.2', strain: 'JF1/MsJ' },
  { accession: 'GCA_921998335.2', strain: 'PWK/PhJ' },
]

const allJson = JSON.parse(
  fs.readFileSync('processedHubJson/all.json', 'utf8'),
) as {
  accession: string
  commonName: string
  scientificName: string
  ncbiAssemblyName: string
  jbrowseLink: string
}[]

const byAccession = new Map(allJson.map(a => [a.accession, a]))

const metadata = ENSEMBL_MOUSE_STRAINS.map(({ accession, strain }) => {
  const entry = byAccession.get(accession)
  if (!entry) {
    console.warn(`Warning: ${accession} not found in all.json`)
    return null
  }
  // Strip T2T suffix to look up base strain (e.g. "CAST/EiJ (T2T)" → "CAST/EiJ")
  const baseName = strain.replace(/ \(T2T\)$/, '')
  const jaxId = JAX_STRAIN_IDS[baseName]
  const yearMatch = /(\d{4})/.exec(entry.commonName)
  return {
    accession,
    strain,
    assemblyYear: yearMatch ? yearMatch[1] : null,
    jbrowseLink: entry.jbrowseLink,
    jaxUrl: jaxId ? jaxUrl(jaxId) : null,
  }
}).filter(e => e !== null)

fs.writeFileSync(
  '../website/src/ensemblMouseStrains.json',
  JSON.stringify(metadata, null, 2),
)
console.log(
  `Written ${metadata.length} entries to ../website/src/ensemblMouseStrains.json`,
)
