import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'

import { mergeConfigs } from './merger.ts'
import { JBrowseConfig, MergeOptions } from './types.ts'

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

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }

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

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(mergedConfig),
    }
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

async function fetchConfigs(urls: string[]): Promise<JBrowseConfig[]> {
  return Promise.all(
    urls.map(async url => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(
          `Failed to fetch config from ${url}: ${response.statusText}`,
        )
      }
      const config = (await response.json()) as JBrowseConfig
      const baseUri = url.slice(0, url.lastIndexOf('/') + 1)
      addRelativeUris(config, baseUri)
      return config
    }),
  )
}

export { mergeConfigs } from './merger.ts'
export { addRelativeUris, idToConfigUrl }
export * from './types.ts'
