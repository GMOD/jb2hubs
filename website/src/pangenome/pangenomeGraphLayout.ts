// What the page asks the focused-row graph's layout worker, what the worker
// answers, and the client the page keeps.

import { workerClient } from './pangenomeWorkerClient.ts'

import type { ParsedRegion, WindowGene } from './pangenomeRegion.ts'
import type { AbridgedWalk } from './pangenomeWalkCut.ts'
import type { PangenomeWorker } from './pangenomeWorkerClient.ts'

export interface GraphRequest {
  walksUrl: string
  // The windows to draw, widest first: the first whose cut the page can draw
  // is the one drawn.
  regions: ParsedRegion[]
  // the row whose walk is read in full where the file abridged it
  haplotype?: string
  // the rows lit, the reference's first, each in the colour of its place
  lit: string[]
  // abridged haplotypes to read in full, beside `haplotype`
  expand: string[]
  // the window's genes, outlined and named on the reference they lie on
  genes: WindowGene[]
}

// the graph's SVG, which of the regions it is of, the walks it draws
// abridged, and the CSS colour each lit row's thread is drawn in
export interface Drawn {
  image: string
  region: ParsedRegion
  abridged: AbridgedWalk[]
  lit: { haplotype: string; swatch: string }[]
}

// The lit rows a drawn thread was lifted for, each in its thread's colour: a
// thread several lit rows share is lifted once, in its first pick's colour, so
// the later rows on it get none.
export const litSwatches = (
  threads: { picks: readonly string[]; swatch: string }[],
  lit: string[],
) =>
  lit.flatMap(haplotype => {
    const thread = threads.find(t => t.picks[0]?.startsWith(`${haplotype}#`))
    return thread ? [{ haplotype, swatch: thread.swatch }] : []
  })

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
