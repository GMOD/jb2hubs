// What the page asks the focused-row graph's layout worker, what the worker
// answers, and the client the page keeps.

import { workerClient } from './pangenomeWorkerClient.ts'

import type { ParsedRegion } from './pangenomeRegion.ts'
import type { AbridgedWalk } from './pangenomeWalkCut.ts'
import type { PangenomeWorker } from './pangenomeWorkerClient.ts'

export interface GraphRequest {
  walksUrl: string
  // The windows to draw, widest first: the first whose cut the page can draw
  // is the one drawn.
  regions: ParsedRegion[]
  haplotype?: string
  // abridged haplotypes to read in full, beside `haplotype`
  expand: string[]
}

// the graph's SVG, which of the regions it is of, and the walks it draws
// abridged
export interface Drawn {
  image: string
  region: ParsedRegion
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
    windowOf: ({ walksUrl, regions }) =>
      regions[0] ? windowKey(walksUrl, regions[0]) : walksUrl,
  })
