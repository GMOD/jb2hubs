import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda'
import { mergeConfigs } from './merger'
import { JBrowseConfig, MergeOptions } from './types'

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }

  try {
    const method = event.requestContext?.http?.method

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

    const params = event.queryStringParameters || {}

    if (!params.configUrls) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'configUrls query parameter is required',
          example:
            '?configUrls=https://example.com/config1.json,https://example.com/config2.json',
        }),
      }
    }

    const configUrls = params.configUrls.split(',').map(url => url.trim())

    const options: MergeOptions = {
      includeSyntenyTracks: params.includeSyntenyTracks === 'true',
      createDefaultSession: params.createDefaultSession !== 'false',
      sessionType: (params.sessionType as 'linear' | 'synteny') || 'synteny',
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
      return response.json() as Promise<JBrowseConfig>
    }),
  )
}

export { mergeConfigs } from './merger'
export * from './types'
