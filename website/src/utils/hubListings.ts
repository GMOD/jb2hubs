import fs from 'fs'
import path from 'path'

import type { UcscGenomeEntry } from './ucscMapping.ts'

// Build-time reads of the hub listings. Paths are relative to website/, where
// astro builds run.

// processedHubJson/<name>.json, pulled from S3 by `predev`: one per GenArk
// category, plus all.json, their union
export function readHubListing<T>(name: string) {
  return JSON.parse(
    fs.readFileSync(path.join('processedHubJson', `${name}.json`), 'utf-8'),
  ) as T[]
}

export function hasHubListing(name: string) {
  return fs.existsSync(path.join('processedHubJson', `${name}.json`))
}

export interface UcscListEntry extends UcscGenomeEntry {
  orderKey: number
}

// src/list.json's UCSC genomes, keyed by db
export function readUcscGenomes() {
  return (
    JSON.parse(fs.readFileSync(path.join('src', 'list.json'), 'utf-8')) as {
      ucscGenomes: Record<string, UcscListEntry>
    }
  ).ucscGenomes
}
