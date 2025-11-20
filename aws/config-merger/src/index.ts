import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { ConfigMerger } from './merger'
import { JBrowseConfig, MergeOptions } from './types'

interface MergeRequest {
  configUrls?: string[]
  configs?: JBrowseConfig[]
  options?: MergeOptions
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
        body: JSON.stringify({ error: 'Request body is required' }),
      }
    }

    const request: MergeRequest = JSON.parse(event.body)

    let configs: JBrowseConfig[] = []

    if (request.configs) {
      configs = request.configs
    } else if (request.configUrls) {
      configs = await fetchConfigs(request.configUrls)
    } else {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Either configs or configUrls must be provided',
        }),
      }
    }

    const merger = new ConfigMerger()
    const mergedConfig = merger.mergeConfigs(configs, request.options || {})

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify(mergedConfig),
    }
  } catch (error) {
    console.error('Error merging configs:', error)

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to merge configs',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    }
  }
}

async function fetchConfigs(urls: string[]): Promise<JBrowseConfig[]> {
  const fetchPromises = urls.map(async url => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch config from ${url}: ${response.statusText}`)
    }
    return response.json() as Promise<JBrowseConfig>
  })

  return Promise.all(fetchPromises)
}

export { ConfigMerger } from './merger'
export * from './types'
