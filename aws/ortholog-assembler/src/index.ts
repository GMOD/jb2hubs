import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import {
  ANCHOR_CHOICES,
  DEFAULT_FLANK_BP,
  DEFAULT_MAX_ANCHORS,
  FLANK_CHOICES_BP,
  assembleNeighborhood,
} from '../../../website/src/components/neighborhood.ts'

import type { APIGatewayProxyResultV2 } from 'aws-lambda'

// Tolerant of both REST API (v1: event.httpMethod) and HTTP API (v2:
// event.requestContext.http.method) payloads, so the function works regardless
// of which API Gateway type fronts it.
interface ApiEvent {
  httpMethod?: string
  requestContext?: { http?: { method?: string } }
  queryStringParameters?: Record<string, string | undefined> | null
}

// The assembler logic is imported verbatim from the website package (esbuild
// bundles it in), and so is the vocabulary of options the form offers, so the
// Lambda refuses exactly what the form cannot ask for. This Lambda adds only
// the durable S3 cache around it.

const s3 = new S3Client({})
const BUCKET = process.env.CACHE_BUCKET
// Bump when the assembler's output or its gene resolution changes, or a cached
// answer from the old code is served as a HIT forever. v3: resolveGeneId stopped
// taking NCBI's first hit (human `TTN` resolved to TTR). v4: a Datasets failure
// no longer falls through to esearch's single guess, which cached the wrong gene
// under the right symbol, and the key keeps the symbol's case, since fly `Dl`
// (Delta) and `dl` (dorsal) are different genes. v5: an ortholog far longer
// than its anchor's median spans its coding exons, not every transcript. v6:
// every candidate neighbour is read, not Datasets' first page of 20, and the
// query's merged GeneIDs, readthrough loci and genes off the query's own
// sequence are left out.
const PREFIX = 'neighborhood/v6'

// NCBI moves species to new assemblies and adds ortholog calls, so an answer is
// rebuilt once it is a month old: TP53's differed from live NCBI in 12 of about
// 666 species after 37 days, 6 of them on superseded assemblies.
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}
const json = { ...cors, 'Content-Type': 'application/json' }

interface Params {
  gene: string
  ref: number
  flankBp: number
  maxAnchors: number
}

// Every anchor is one more NCBI call and the reference is part of the cache
// key, so a request outside the form's vocabulary is refused rather than
// costing ~200 calls (`maxAnchors=200`) or being cached under human (`ref=abc`).
function chosen(raw: string | undefined, choices: number[], fallback: number) {
  return raw === undefined
    ? fallback
    : choices.includes(Number(raw))
      ? Number(raw)
      : undefined
}

export function parseParams(
  q: Record<string, string | undefined>,
): { params: Params } | { error: string } {
  const gene = q.gene?.trim()
  const ref =
    q.ref === undefined
      ? 9606
      : /^[1-9]\d*$/.test(q.ref)
        ? Number(q.ref)
        : undefined
  const flankBp = chosen(q.flank, FLANK_CHOICES_BP, DEFAULT_FLANK_BP)
  const maxAnchors = chosen(q.maxAnchors, ANCHOR_CHOICES, DEFAULT_MAX_ANCHORS)
  return !gene
    ? { error: 'gene query parameter is required' }
    : ref === undefined
      ? { error: 'ref must be a positive integer NCBI taxon id' }
      : flankBp === undefined
        ? { error: `flank must be one of ${FLANK_CHOICES_BP.join(', ')}` }
        : maxAnchors === undefined
          ? { error: `maxAnchors must be one of ${ANCHOR_CHOICES.join(', ')}` }
          : { params: { gene, ref, flankBp, maxAnchors } }
}

function cacheKey({ gene, ref, flankBp, maxAnchors }: Params) {
  const slug = gene.replace(/[^A-Za-z0-9]+/g, '_')
  return `${PREFIX}/${ref}/${slug}.f${flankBp}.a${maxAnchors}.json`
}

async function readCache(key: string) {
  try {
    const res = BUCKET
      ? await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
      : undefined
    const body = await res?.Body?.transformToString()
    const age = Date.now() - (res?.LastModified?.getTime() ?? 0)
    return body === undefined ? undefined : { body, fresh: age < MAX_AGE_MS }
  } catch (error) {
    if (!(error instanceof NoSuchKey)) {
      throw error
    }
    return undefined
  }
}

async function writeCache(key: string, body: string) {
  if (BUCKET) {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        CacheControl: 'public, max-age=86400',
      }),
    )
  }
}

// A month-old answer is rebuilt, and served as it stands when the rebuild
// fails: NCBI being down is no reason to lose a figure that drew yesterday.
async function rebuild(params: Params, key: string, stale: string | undefined) {
  try {
    const neighborhood = await assembleNeighborhood(params.gene, params.ref, {
      flankBp: params.flankBp,
      maxAnchors: params.maxAnchors,
    })
    const body = JSON.stringify(neighborhood)
    await writeCache(key, body)
    return { body, hit: false }
  } catch (error) {
    if (stale === undefined) {
      throw error
    }
    console.error(
      'ortholog-assembler rebuild failed, serving the old answer:',
      error,
    )
    return { body: stale, hit: true }
  }
}

function ok(body: string, hit: boolean) {
  return {
    statusCode: 200,
    headers: {
      ...json,
      'Cache-Control': 'public, max-age=86400',
      // Not `X-Cache`: API Gateway's edge overwrites that one with its own.
      'X-Assembler-Cache': hit ? 'HIT' : 'MISS',
    },
    body,
  }
}

export const handler = async (
  event: ApiEvent,
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET'
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' }
  }
  if (method !== 'GET') {
    return {
      statusCode: 405,
      headers: json,
      body: JSON.stringify({ error: 'Method not allowed. Use GET' }),
    }
  }

  const parsed = parseParams(event.queryStringParameters ?? {})
  if ('error' in parsed) {
    return {
      statusCode: 400,
      headers: json,
      body: JSON.stringify({
        error: parsed.error,
        message: parsed.error,
        example: '?gene=BRCA1&ref=9606',
      }),
    }
  }
  const { params } = parsed
  const key = cacheKey(params)

  try {
    const cached = await readCache(key)
    const answer = cached?.fresh
      ? { body: cached.body, hit: true }
      : await rebuild(params, key, cached?.body)
    return ok(answer.body, answer.hit)
  } catch (error) {
    console.error('ortholog-assembler error:', error)
    return {
      statusCode: 502,
      headers: json,
      body: JSON.stringify({
        error: 'Failed to assemble ortholog neighborhood',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}
