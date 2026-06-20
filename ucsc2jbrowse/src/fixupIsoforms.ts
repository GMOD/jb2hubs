import fs from 'fs'

/**
 * Fixes up isoform names in a given file.
 * Specifically handles cases where gene names are missing in the input.
 * @param filePath The path to the file containing isoform data.
 */
function fixupIsoforms(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')

  const fixedLines = lines.map(line => {
    if (!line) {
      // preserve blank lines (e.g. the trailing newline) as-is
      return line
    }
    const [r0, r1] = line.split('\t')

    // xenoRefGene has missing gene names
    if (!r0) {
      return `${r1}-gene\t${r1}`
    } else if (!r1) {
      // genscan has missing gene names too...but different
      return `${r0}-gene\t${r0}`
    } else {
      // Normal case
      return line
    }
  })

  fs.writeFileSync(filePath, fixedLines.join('\n'))
}

if (process.argv.length !== 3) {
  console.error('Usage: node fixupIsoforms.ts <filePath>')
  process.exit(1)
}

fixupIsoforms(process.argv[2]!)
