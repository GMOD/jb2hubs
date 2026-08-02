import fs from 'fs'

import { generateJBrowseConfigForAssemblyHub, myfetchtext } from 'hubtools'

/**
 * Parses a UCSC track hub and generates a JBrowse configuration JSON.
 * @param trackDbUrl The URL to the trackDb.txt file of the assembly hub.
 * @param outputFilePath The path where the generated JBrowse config JSON will be written.
 */
async function parseTrackHub(trackDbUrl: string, outputFilePath: string) {
  try {
    const hubFileText = await myfetchtext(trackDbUrl)
    const jbrowseConfig = generateJBrowseConfigForAssemblyHub({
      hubFileText,
      trackDbUrl,
    })

    fs.writeFileSync(outputFilePath, JSON.stringify(jbrowseConfig, null, 2))
    console.log(
      `Successfully generated JBrowse config for ${trackDbUrl} at ${outputFilePath}`,
    )
  } catch (error) {
    console.error(`Error parsing track hub ${trackDbUrl}: ${error}`)
    process.exit(1)
  }
}

if (process.argv.length !== 4) {
  console.error('Usage: node parseTrackHub.ts <trackDbUrl> <outputFilePath>')
  process.exit(1)
}

await parseTrackHub(process.argv[2]!, process.argv[3]!)
