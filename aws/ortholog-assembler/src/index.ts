import {
  GetObjectCommand,
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
// Bump when the assembler's output shape or logic changes, so stale cached
// results are bypassed rather than served indefinitely. v2: PlacedGene gained a
// `chromosome` field (UCSC chr mapping for the whole-genome alignment launch).
// v3: resolveGeneId stopped taking NCBI's first hit, which for a symbol that is
// also another gene's alias resolved to the wrong gene entirely — human `TTN`
// returned TTR (transthyretin) rather than titin. Every neighborhood assembled
// for such a symbol before that fix is cached under the same key and would be
// served as a HIT forever, fixed resolver or not.
const PREFIX = 'neighborhood/v3'

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
  const slug = gene.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  return `${PREFIX}/${ref}/${slug}.f${flankBp}.a${maxAnchors}.json`
}

async function readCache(key: string): Promise<string | undefined> {
  if (!BUCKET) {
    return undefined
  }
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    )
    return await res.Body?.transformToString()
  } catch {
    return undefined // miss (NoSuchKey) or unreadable -> assemble fresh
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

  const ok = (body: string, hit: boolean) => ({
    statusCode: 200,
    headers: {
      ...json,
      'Cache-Control': 'public, max-age=86400',
      // Not `X-Cache`: API Gateway's edge overwrites that one with its own.
      'X-Assembler-Cache': hit ? 'HIT' : 'MISS',
    },
    body,
  })

  try {
    const cached = await readCache(key)
    if (cached !== undefined) {
      return ok(cached, true)
    }
    const neighborhood = await assembleNeighborhood(params.gene, params.ref, {
      flankBp: params.flankBp,
      maxAnchors: params.maxAnchors,
    })
    const body = JSON.stringify(neighborhood)
    await writeCache(key, body)
    return ok(body, false)
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
