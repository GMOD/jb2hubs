import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import { assembleNeighborhood } from '../../../website/src/components/neighborhood.ts'

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
// bundles it in), so the serverless filler and the browser dev fallback run the
// exact same code. This Lambda adds only the durable S3 cache around it.

const s3 = new S3Client({})
const BUCKET = process.env.CACHE_BUCKET
const PREFIX = 'neighborhood'

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

  const q = event.queryStringParameters ?? {}
  if (!q.gene) {
    return {
      statusCode: 400,
      headers: json,
      body: JSON.stringify({
        error: 'gene query parameter is required',
        example: '?gene=BRCA1&ref=9606',
      }),
    }
  }

  const params: Params = {
    gene: q.gene.trim(),
    ref: Number(q.ref) || 9606,
    flankBp: Number(q.flank) || 150_000,
    maxAnchors: Number(q.maxAnchors) || 11,
  }
  const key = cacheKey(params)

  try {
    const cached = await readCache(key)
    if (cached !== undefined) {
      return {
        statusCode: 200,
        headers: { ...json, 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'HIT' },
        body: cached,
      }
    }
    const neighborhood = await assembleNeighborhood(params.gene, params.ref, {
      flankBp: params.flankBp,
      maxAnchors: params.maxAnchors,
    })
    const body = JSON.stringify(neighborhood)
    await writeCache(key, body)
    return {
      statusCode: 200,
      headers: { ...json, 'Cache-Control': 'public, max-age=86400', 'X-Cache': 'MISS' },
      body,
    }
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
