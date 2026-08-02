import path from 'path'

/**
 * Generates shell commands for creating and adding synteny tracks.
 * This script is currently unused in the main pipeline but can be run independently.
 * It outputs shell commands to stdout.
 */
function generateSyntenyCommands() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error(
      'Usage: node createSyntenyTracks.ts <assembly_name1> [assembly_name2] ...',
    )
    process.exit(1)
  }

  const assemblyNames = args.map(arg => path.basename(arg))
  const firstAssemblyDir = path.dirname(args[0]!)

  console.log(
    '#!/bin/bash\n' +
      'function pif() {\n' +
      '\tpigz -dc $1 > `basename $1 .gz`\n' +
      '\tchain2paf --input `basename $1 .gz` > `basename $1 .chain.gz`.paf\n' +
      '\tjbrowse make-pif --csi `basename $1 .chain.gz`.paf  # generates pif.gz and pif.gz.csi\n' +
      '}\n',
  )

  const pifCommands: string[] = []
  const addTrackCommands: string[] = []

  for (const a1 of assemblyNames) {
    for (const a2 of assemblyNames) {
      if (a1 !== a2) {
        // Assuming a specific naming convention for chain files
        // e.g., hg19ToHg38.over.chain.gz
        const targetAssemblyCapitalized =
          a2.charAt(0).toUpperCase() + a2.slice(1)
        const chainFileName = `${a1}To${targetAssemblyCapitalized}.over.chain.gz`
        const chainFilePath = `${firstAssemblyDir}/${a1}/liftOver/${chainFileName}`
        const pifFileName = `${path.basename(chainFileName, '.chain.gz')}.pif.gz`

        pifCommands.push(`pif ${chainFilePath}`)
        addTrackCommands.push(
          `jbrowse add-track ${pifFileName} -a ${a1},${a2} --out ${process.env.OUT} --load inPlace --force --category Synteny`,
        )
      }
    }
  }

  console.log(pifCommands.join('\n'))
  console.log('') // Empty line for separation
  console.log(addTrackCommands.join('\n'))
}

generateSyntenyCommands()
