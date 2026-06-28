// Frontend entry point for fetching a gene's ortholog neighborhood. When the
// serverless assembler is deployed (PUBLIC_ORTHOLOG_API set to its base URL), it
// serves from the Lambda + S3 cache; otherwise it assembles directly in the
// browser as a dev fallback. Either way the component receives the same
// Neighborhood shape.

import {
  assembleNeighborhood,
  type Neighborhood,
  type NeighborhoodOptions,
} from './neighborhood.ts'

const API = import.meta.env.PUBLIC_ORTHOLOG_API as string | undefined

async function tryApi(
  api: string,
  gene: string,
  refTaxonId: number,
  opts: NeighborhoodOptions,
): Promise<Neighborhood | undefined> {
  const params = new URLSearchParams({ gene, ref: String(refTaxonId) })
  if (opts.flankBp) {
    params.set('flank', String(opts.flankBp))
  }
  if (opts.maxAnchors) {
    params.set('maxAnchors', String(opts.maxAnchors))
  }
  const res = await fetch(`${api}/ortholog-set?${params.toString()}`)
  return res.ok ? ((await res.json()) as Neighborhood) : undefined
}

export async function getNeighborhood(
  gene: string,
  refTaxonId: number,
  opts: NeighborhoodOptions = {},
): Promise<Neighborhood> {
  const viaApi = API ? await tryApi(API, gene, refTaxonId, opts) : undefined
  return viaApi ?? assembleNeighborhood(gene, refTaxonId, opts)
}
