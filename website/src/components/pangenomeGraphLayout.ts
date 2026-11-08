// What the page asks the focused-row graph's layout worker, what the worker
// answers, and the client the page keeps.

import { workerClient } from './pangenomeWorkerClient.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'
import type { AbridgedWalk } from './pangenomeWalkCut.ts'
import type { PangenomeWorker } from './pangenomeWorkerClient.ts'

export interface GraphRequest {
  walksUrl: string
  region: ParsedRegion
  haplotype?: string
  // abridged haplotypes to read in full, beside `haplotype`
  expand: string[]
}

// the graph's SVG, and the walks it draws abridged
export interface Drawn {
  image: string
  abridged: AbridgedWalk[]
}

export const windowKey = (
  walksUrl: string,
  { chrom, start, end }: ParsedRegion,
) => `${walksUrl} ${chrom}:${start}-${end}`

// The worker's cut of a window serves the next row's highlight, and a request
// for another window replaces it.
export const layoutClient = (
  spawn: () => PangenomeWorker<GraphRequest, Drawn>,
) =>
  workerClient(spawn, {
    name: 'graph layout',
    windowOf: ({ walksUrl, region }) => windowKey(walksUrl, region),
  })
