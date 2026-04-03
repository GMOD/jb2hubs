import * as readline from 'readline'

import { enhanceConfig } from 'hubtools'

const rl = readline.createInterface({ input: process.stdin })
let processed = 0

for await (const line of rl) {
  const configPath = line.trim()
  if (!configPath) {
    continue
  }
  try {
    enhanceConfig(configPath)
    processed++
  } catch (error) {
    console.error(`Error enhancing ${configPath}: ${error}`)
  }
}

console.error(`Enhanced ${processed} configs`)
