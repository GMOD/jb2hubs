import fs from 'fs'
import path from 'path'

import {
  checked,
  isArrayOf,
  isBoolean,
  isNumber,
  isOptional,
  isRecordOf,
  isShape,
  isString,
} from 'hubtools/guards'

import type { UcscGenomeEntry } from './ucscMapping.ts'
import type { ProcessedHubEntry } from 'hubtools'
import type { Guard } from 'hubtools/guards'

// Build-time reads of the hub listings. Paths are relative to website/, where
// astro builds run.

const optString = isOptional(isString)

const isProcessedHubEntry: Guard<ProcessedHubEntry> = isShape({
  accession: isString,
  assembly: isString,
  scientificName: isString,
  commonName: isString,
  taxonId: isNumber,
  jbrowseLink: isString,
  jbrowseConfig: isString,
  ncbiGff: isString,
  ncbiLink: isString,
  ucscDataLink: isString,
  ucscBrowserLink: isString,
  igvBrowserLink: isString,
  ncbiName: isString,
  ncbiBrowserLink: isString,
  seqReleaseDate: optString,
  submitterOrg: optString,
  ncbiOrganism: optString,
  ncbiAssemblyName: optString,
  ncbiRefSeqCategory: optString,
  suppressed: isBoolean,
  assemblyType: optString,
  assemblyStatus: optString,
  pairedAccession: optString,
  ncbiMissing: isBoolean,
  source: isString,
})

export const isProcessedHubList = isArrayOf(isProcessedHubEntry)

const isHubListing = isArrayOf(isProcessedHubEntry)

// processedHubJson/<name>.json, pulled from S3 by `predev`: one per GenArk
// category, plus all.json, their union
const hubListings = new Map<string, ProcessedHubEntry[]>()

export function readHubListing(name: string) {
  let listing = hubListings.get(name)
  if (!listing) {
    const file = path.join('processedHubJson', `${name}.json`)
    listing = checked(
      JSON.parse(fs.readFileSync(file, 'utf-8')),
      isHubListing,
      file,
    )
    hubListings.set(name, listing)
  }
  return listing
}

export function hasHubListing(name: string) {
  return fs.existsSync(path.join('processedHubJson', `${name}.json`))
}

export interface UcscListEntry extends UcscGenomeEntry {
  orderKey: number
}

// src/list.json's UCSC genomes, keyed by db
let ucscGenomes: Record<string, UcscListEntry> | undefined

const isUcscListEntry: Guard<UcscListEntry> = isShape({
  description: isString,
  organism: isString,
  scientificName: isString,
  sourceName: isOptional(isString),
  taxId: isNumber,
  orderKey: isNumber,
})

const isUcscGenomeList = isShape({ ucscGenomes: isRecordOf(isUcscListEntry) })

export function readUcscGenomes() {
  const file = path.join('src', 'list.json')
  ucscGenomes ??= checked(
    JSON.parse(fs.readFileSync(file, 'utf-8')),
    isUcscGenomeList,
    file,
  ).ucscGenomes
  return ucscGenomes
}
