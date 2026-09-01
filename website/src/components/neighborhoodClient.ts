// Frontend entry point for fetching a gene's ortholog neighborhood from the
// serverless assembler (aws/ortholog-assembler), which holds the NCBI rate
// budget once and caches every answer in S3. There is deliberately no
// in-browser fallback: assembling here is 15 serialized NCBI calls per visitor,
// which is the reason the Lambda exists.

import { delay } from '../lib/delay.ts'

import type { Neighborhood, NeighborhoodOptions } from './neighborhood.ts'

export const ORTHOLOG_API =
  'https://qkeuv38wf2.execute-api.us-east-2.amazonaws.com/prod'

// A cold miss keeps the Lambda assembling past API Gateway's 29 s integration
// limit, which surfaces as a 504 while the assembly goes on and lands in the
// cache; one retry after a pause is what reads it back.
const RETRY_DELAY_MS = 5000

export interface ClientIo {
  fetch: (url: string) => Promise<Response>
  wait: (ms: number) => Promise<unknown>
}

const browserIo: ClientIo = {
  fetch: url => fetch(url),
  wait: delay,
}

class RetryableError extends Error {}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isNeighborhood(v: unknown): v is Neighborhood {
  return (
    isRecord(v) &&
    isRecord(v.query) &&
    typeof v.query.symbol === 'string' &&
    Array.isArray(v.anchors) &&
    Array.isArray(v.species)
  )
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// The Lambda answers a failure with { message }, e.g. `no gene found for "FOO"`,
// which is the line worth showing; the status line is what is left otherwise.
function messageOf(status: number, statusText: string, body: unknown) {
  return isRecord(body) && typeof body.message === 'string'
    ? body.message
    : `${status} ${statusText}`.trim()
}

export function neighborhoodUrl(
  gene: string,
  refTaxonId: number,
  opts: NeighborhoodOptions,
) {
  const params = new URLSearchParams({ gene, ref: String(refTaxonId) })
  if (opts.flankBp) {
    params.set('flank', String(opts.flankBp))
  }
  if (opts.maxAnchors) {
    params.set('maxAnchors', String(opts.maxAnchors))
  }
  return `${ORTHOLOG_API}/ortholog-set?${params.toString()}`
}

async function request(url: string, io: ClientIo): Promise<Neighborhood> {
  const res = await io.fetch(url).catch((e: unknown) => {
    throw new RetryableError(e instanceof Error ? e.message : String(e))
  })
  const body = parseJson(await res.text())
  if (res.status === 504) {
    throw new RetryableError(messageOf(res.status, res.statusText, body))
  }
  if (!res.ok) {
    throw new Error(messageOf(res.status, res.statusText, body))
  }
  if (!isNeighborhood(body)) {
    throw new Error(
      'the assembler returned something that is not a neighborhood',
    )
  }
  return body
}

export async function getNeighborhood(
  gene: string,
  refTaxonId: number,
  opts: NeighborhoodOptions = {},
  io: ClientIo = browserIo,
) {
  const url = neighborhoodUrl(gene, refTaxonId, opts)
  return request(url, io).catch(async (e: unknown) => {
    if (e instanceof RetryableError) {
      await io.wait(RETRY_DELAY_MS)
      return request(url, io)
    }
    throw e
  })
}
