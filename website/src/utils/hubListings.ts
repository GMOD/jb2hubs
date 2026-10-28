import fs from 'fs'
import path from 'path'

import type { UcscGenomeEntry } from './ucscMapping.ts'

// Build-time reads of the hub listings. Paths are relative to website/, where
// astro builds run.

// processedHubJson/<name>.json, pulled from S3 by `predev`: one per GenArk
// category, plus all.json, their union
const hubListings = new Map<string, unknown[]>()

export function readHubListing<T>(name: string) {
  let listing = hubListings.get(name)
  if (!listing) {
    listing = JSON.parse(
      fs.readFileSync(path.join('processedHubJson', `${name}.json`), 'utf-8'),
    ) as unknown[]
    hubListings.set(name, listing)
  }
  return listing as T[]
}

export function hasHubListing(name: string) {
  return fs.existsSync(path.join('processedHubJson', `${name}.json`))
}

export interface UcscListEntry extends UcscGenomeEntry {
  orderKey: number
}

// src/list.json's UCSC genomes, keyed by db
let ucscGenomes: Record<string, UcscListEntry> | undefined

export function readUcscGenomes() {
  ucscGenomes ??= (
    JSON.parse(fs.readFileSync(path.join('src', 'list.json'), 'utf-8')) as {
      ucscGenomes: Record<string, UcscListEntry>
    }
  ).ucscGenomes
  return ucscGenomes
}
