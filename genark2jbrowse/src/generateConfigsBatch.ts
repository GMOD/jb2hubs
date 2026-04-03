import * as fs from 'fs'
import * as readline from 'readline'

import deepEqual from 'fast-deep-equal'
import {
  generateJBrowseConfigForAssemblyHub,
  readJSON,
  writeJSON,
} from 'hubtools'

const CONCURRENCY = 16

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

console.error(
  `Processing ${paths.length} configs (concurrency: ${CONCURRENCY})...`,
)

let completed = 0
const total = paths.length

function worker(queue: string[]) {
  while (queue.length > 0) {
    const metaPath = queue.pop()!
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
}

const queue = [...paths]
Array.from({ length: CONCURRENCY }, () => {
  worker(queue)
})

console.error(`Done: ${completed} configs processed`)
