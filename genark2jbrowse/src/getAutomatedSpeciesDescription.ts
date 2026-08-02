import * as fs from 'fs'
import { execSync } from 'node:child_process'

import { getHubBasePath, readJSON } from './util.ts'

const LLM_MODEL = 'claude-3-haiku'

interface SpeciesEntry {
  accession: string
  scientificName: string
}

/**
 * Generates and stores automated species descriptions using an LLM.
 * Descriptions are stored in `speciesDescriptions/<scientificName>.json`
 * and also copied to the hub-specific `description.json`.
 */
function generateSpeciesDescriptions() {
  fs.mkdirSync('speciesDescriptions', { recursive: true })

  const allProcessedEntries = readJSON<(SpeciesEntry | null)[]>(
    'processedHubJson/all.json',
  ).filter((entry): entry is SpeciesEntry => !!entry)

  let processedCount = 0
  for (const entry of allProcessedEntries) {
    try {
      const { scientificName, accession } = entry

      // Construct the path for the hub-specific description file
      const hubDescriptionFilePath = `${getHubBasePath(accession)}/description.json`

      // Construct the path for the central species description file
      const centralDescriptionFilePath = `speciesDescriptions/${scientificName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')}.json`

      // Check if the hub-specific description file already exists
      if (!fs.existsSync(hubDescriptionFilePath)) {
        // If not, check if a central description exists
        if (!fs.existsSync(centralDescriptionFilePath)) {
          console.log(
            `Generating description for ${scientificName} (${accession}) (${++processedCount}/${allProcessedEntries.length})`,
          )

          // Call LLM to get description
          const prompt = `Provide a short scientific description of this species: ${scientificName}`
          const description = execSync(
            `echo "${prompt}" | llm -m ${LLM_MODEL}`,
            { encoding: 'utf8' },
          ).trim()

          const descriptionObject = JSON.stringify(
            {
              description,
              model: LLM_MODEL,
              prompt,
              dateGenerated: +new Date(),
            },
            null,
            2,
          )

          // Write to both central and hub-specific locations
          fs.writeFileSync(hubDescriptionFilePath, descriptionObject)
          fs.writeFileSync(centralDescriptionFilePath, descriptionObject)
        } else {
          // If central description exists, copy it to the hub-specific location
          console.log(
            `Copying existing description for ${scientificName} from central store.`,
          )
          fs.copyFileSync(centralDescriptionFilePath, hubDescriptionFilePath)
        }
      } else {
        console.log(`Description already exists for ${scientificName}.`)
      }
    } catch (error) {
      console.error(
        `Error processing ${entry.scientificName} (${entry.accession}): ${error}`,
      )
    }
  }
}

generateSpeciesDescriptions()
