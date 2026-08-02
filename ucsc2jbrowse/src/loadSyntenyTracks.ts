import { exec } from 'child_process'
import path from 'path'
import { promisify } from 'util'

const pexec = promisify(exec)

/**
 * Loads synteny tracks into JBrowse.
 * This script is currently unused in the main pipeline but can be run independently.
 * It expects assembly names as command-line arguments.
 */
async function loadSyntenyTracks() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error(
      'Usage: node loadSyntenyTracks.ts <assembly_name1> [assembly_name2] ...',
    )
    process.exit(1)
  }

  const assemblyNames = args.map(arg => path.basename(arg))

  for (const a1 of assemblyNames) {
    for (const a2 of assemblyNames) {
      // Assuming a specific naming convention for chain files
      // e.g., hg19ToHg38.over.chain.gz
      const targetAssemblyCapitalized = a2.charAt(0).toUpperCase() + a2.slice(1)
      const chainFileName = `${a1}To${targetAssemblyCapitalized}.over.chain.gz`
      const chainFilePath = `${a1}/liftOver/${chainFileName}`

      console.log(`Adding synteny track for ${a1} to ${a2}...`)
      try {
        const { stderr } = await pexec(
          `jbrowse add-track ${chainFilePath} -a ${a1},${a2} --out ${process.env.OUT} --load copy --force`,
        )
        if (stderr) {
          console.error(stderr)
        }
      } catch (error) {
        console.error(`Error adding track ${chainFilePath}: ${error}`)
      }
    }
  }
}

await loadSyntenyTracks()
