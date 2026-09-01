// Rewrites the JSON files named on stdin in the pipeline's output format
// (hubtools formatJson), touching only the ones that differ. Used after
// `jbrowse text-index`, which rewrites config.json in its own layout.
import * as fs from 'fs'
import * as readline from 'readline'

import { formatJson } from 'hubtools'

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
