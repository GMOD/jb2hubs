import { gzipSync } from 'node:zlib'

import { mergeConfigs } from './merger.ts'

import type { JBrowseConfig, MergeOptions } from './types.ts'
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda'

function addRelativeUris(config: unknown, baseUri: string) {
  if (typeof config === 'object' && config !== null) {
    const obj = config as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        addRelativeUris(obj[key], baseUri)
      } else if (key === 'uri' && !obj.baseUri) {
        obj.baseUri = baseUri
      }
    }
  }
}

function idToConfigUrl(id: string) {
  if (id.startsWith('GCA') || id.startsWith('GCF')) {
    // e.g. GCF_000298275.1 -> GCF/000/298/275/GCF_000298275.1
    const prefix = id.slice(0, 3)
    const numericPart = id.slice(4).split('.')[0]
    const chunks = [
      numericPart.slice(0, 3),
      numericPart.slice(3, 6),
      numericPart.slice(6, 9),
    ]
    return `https://jbrowse.org/hubs/genark/${prefix}/${chunks.join('/')}/${id}/config.json`
  }
  return `https://jbrowse.org/ucsc/${id}/config.json`
}

// Fetched configs live for the Lambda instance, keyed by url. A stacked
// synteny launch merges one full config per genome — hg38's is 2 MB — and the
// same handful of genomes is asked for again and again, so on a warm instance
// the merge re-fetches nothing. An hour bounds how stale a regenerated config
// can be served; a failed fetch is not remembered.
const CONFIG_TTL_MS = 60 * 60 * 1000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// An HTTP API never compresses, so the function does: hg38 with mm39 is 2.7 MB
// of JSON and about 0.5 MB gzipped, and gzip keeps a four-genome stack under
// Lambda's 6 MB response limit. Browsers may reuse a merge for as long as a
// warm instance serves its fetched configs (CONFIG_TTL_MS).
export function mergedResponse(body: string, acceptEncoding = '') {
  const gzipped = /\bgzip\b/.test(acceptEncoding)
  const headers: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${CONFIG_TTL_MS / 1000}`,
    Vary: 'Accept-Encoding',
    ...(gzipped ? { 'Content-Encoding': 'gzip' } : {}),
  }
  return {
    statusCode: 200,
    headers,
    isBase64Encoded: gzipped,
    body: gzipped ? gzipSync(body).toString('base64') : body,
  }
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const method = event.requestContext.http.method

    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: '',
      }
    }

    if (method !== 'GET') {
      return {
        statusCode: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed. Use GET' }),
      }
    }

    const params = event.queryStringParameters ?? {}

    if (!params.hubIds) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'hubIds query parameter is required',
          example: '?hubIds=hg38,GCF_000298275.1',
        }),
      }
    }

    const hubIds = params.hubIds.split(',').map(id => id.trim())
    const configUrls = hubIds.map(idToConfigUrl)

    const options: MergeOptions = {
      includeSyntenyTracks: params.includeSyntenyTracks === 'true',
      createDefaultSession: params.createDefaultSession !== 'false',
      sessionType: (params.sessionType ?? 'synteny') as 'linear' | 'synteny',
    }

    const configs = await fetchConfigs(configUrls)
    const mergedConfig = mergeConfigs(configs, options)

    return mergedResponse(
      JSON.stringify(mergedConfig),
      event.headers['accept-encoding'],
    )
  } catch (error) {
    console.error('Error merging configs:', error)

    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to merge configs',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}

interface CachedConfig {
  config: Promise<JBrowseConfig>
  expires: number
}

const configCache = new Map<string, CachedConfig>()

// under the Lambda's 30 s timeout, so a stalled origin answers with an error
const FETCH_TIMEOUT_MS = 20_000

async function fetchConfig(url: string): Promise<JBrowseConfig> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(
      `Failed to fetch config from ${url}: ${response.statusText}`,
    )
  }
  const config = (await response.json()) as JBrowseConfig
  addRelativeUris(config, url.slice(0, url.lastIndexOf('/') + 1))
  return config
}

function cachedConfig(url: string, now = Date.now()) {
  const hit = configCache.get(url)
  if (hit && hit.expires > now) {
    return hit.config
  }
  const config = fetchConfig(url).catch((e: unknown) => {
    configCache.delete(url)
    throw e
  })
  configCache.set(url, { config, expires: now + CONFIG_TTL_MS })
  return config
}

async function fetchConfigs(urls: string[]): Promise<JBrowseConfig[]> {
  return Promise.all(urls.map(url => cachedConfig(url)))
}

export { mergeConfigs } from './merger.ts'
export { addRelativeUris, cachedConfig, idToConfigUrl }
export type * from './types.ts'
