// Rewrites the JSON files named on stdin in the pipeline's output format
// (hubtools formatJson), touching only the ones that differ. Used after
// `jbrowse text-index`, which rewrites config.json in its own layout.
//
// One copy for both pipelines: ucsc2jbrowse/src/formatConfigs.ts and
// genark2jbrowse/src/formatConfigs.ts were byte-identical. `hubtools` is
// imported by path rather than by package name because the workspace root
// does not depend on it, which is how the other repo-level scripts here reach
// into website/src.
import * as fs from 'fs'
import * as readline from 'readline'

import { formatJson } from '../hubtools/src/formatJson.ts'

const rl = readline.createInterface({ input: process.stdin })
let rewritten = 0
for await (const line of rl) {
  const file = line.trim()
  if (file) {
    const text = fs.readFileSync(file, 'utf8')
    const formatted = formatJson(JSON.parse(text))
    if (formatted !== text) {
      fs.writeFileSync(file, formatted)
      rewritten++
    }
  }
}
console.error(`Reformatted ${rewritten} file(s)`)
