import * as fs from 'fs'
import * as readline from 'readline'

import deepEqual from 'fast-deep-equal'
import {
  generateJBrowseConfigForAssemblyHub,
  readJSON,
  writeJSON,
} from 'hubtools'

function processOne(metaPath: string) {
  const configPath = metaPath.replace('meta.json', 'config.json')

  let hubMeta: { hubFileLocation: string }
  try {
    hubMeta = readJSON(metaPath)
  } catch (error) {
    console.error(`Error reading ${metaPath}: ${error}`)
    return
  }

  let oldConfig: Record<string, unknown> = {}
  try {
    oldConfig = readJSON(configPath)
  } catch {
    // normal on first run
  }

  let hubFileText: string
  try {
    hubFileText = fs.readFileSync(
      metaPath.replace('meta.json', 'hub.txt'),
      'utf8',
    )
  } catch (error) {
    console.error(`Error reading hub.txt for ${metaPath}: ${error}`)
    return
  }

  const newConfig = generateJBrowseConfigForAssemblyHub({
    hubFileText,
    trackDbUrl: hubMeta.hubFileLocation,
  })

  if (!deepEqual(newConfig, oldConfig)) {
    writeJSON(configPath, newConfig)
  }
}

const paths: string[] = []

if (process.argv[2]) {
  paths.push(process.argv[2])
} else {
  const rl = readline.createInterface({ input: process.stdin })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (trimmed) {
      paths.push(trimmed)
    }
  }
}

console.error(`Processing ${paths.length} configs...`)

let completed = 0
const total = paths.length

// processOne is entirely synchronous (readFileSync/writeFileSync), so this is a
// plain sequential loop and is written as one. It used to hand the same queue to
// N "workers" via Array.from, which only ever ran sequentially -- the first call
// drained the queue before the second was invoked -- while logging a concurrency
// figure that was never real. Making it genuinely parallel needs worker_threads
// or child processes, not a different loop shape.
for (const metaPath of paths) {
  try {
    processOne(metaPath)
  } catch (error) {
    console.error(`Failed: ${metaPath}: ${error}`)
  }
  completed++
  if (completed % 1000 === 0) {
    console.error(`  ${completed}/${total}`)
  }
}

console.error(`Done: ${completed} configs processed`)
