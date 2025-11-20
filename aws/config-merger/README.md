# JBrowse Config Merger Lambda

AWS Lambda function that merges multiple JBrowse 2 configuration files into a single config. This is useful for creating synteny views or combining tracks from multiple assemblies.

## Features

- Merges multiple JBrowse config files
- Combines assemblies, tracks, and text search adapters
- Optionally includes synteny tracks between assemblies
- Creates default sessions (linear or synteny view)
- Fetches configs from URLs or accepts them directly in the request
- CORS-enabled API

## API Usage

### GET /merge

Simple GET endpoint with query parameters - perfect for direct JBrowse integration:

```
GET /merge?configUrls=url1,url2&sessionType=synteny
```

**Query Parameters:**
- `configUrls` (required): Comma-separated list of config URLs
- `includeSyntenyTracks` (optional): `true` or `false` (default: `false`)
- `createDefaultSession` (optional): `true` or `false` (default: `true`)
- `sessionType` (optional): `linear` or `synteny` (default: `synteny`)

**Example:**
```
https://your-api.amazonaws.com/Prod/merge?configUrls=https://genomes.jbrowse.org/ucsc/GCF_950023065.1/config.json,https://genomes.jbrowse.org/ucsc/GCF_950005125.1/config.json&sessionType=synteny
```

### Response

Returns a merged JBrowse config JSON:

```json
{
  "assemblies": [...],
  "tracks": [...],
  "aggregateTextSearchAdapters": [...],
  "defaultSession": {...}
}
```

## Development

### Install Dependencies

```bash
yarn install
```

### Build

```bash
yarn build
```

This uses esbuild to bundle all TypeScript files into a single `dist/index.mjs` file (~6.6KB) as an ES module for Lambda deployment.

### Run Tests

```bash
yarn test
```

Tests are written using Vitest.

## Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SAM CLI installed

### Resource Names

The deployment creates clean, predictable resource names:

- **Lambda Function**: `jbrowse-config-merger`
- **API Gateway**: `jbrowse-config-merger-api`
- **CloudWatch Log Group**: `/aws/lambda/jbrowse-config-merger`
- **CloudFormation Stack**: `jbrowse-config-merger` (you choose)

The API Gateway will have a random ID in its URL (e.g., `abc123xyz.execute-api...`), but this is:
- Set once during deployment
- Stable (doesn't change)
- The AWS standard approach

See `DEPLOYMENT_OPTIONS.md` for alternatives if you need even more control.

### Deploy

```bash
# Build the TypeScript code
yarn build

# Deploy using SAM
sam build
sam deploy --guided
```

On first deployment, use `--guided` to configure:
- Stack name: `jbrowse-config-merger`
- AWS Region: your preferred region
- Confirm changes before deploy: Y
- Allow SAM CLI IAM role creation: Y
- Save arguments to configuration file: Y

### Update

After initial deployment:

```bash
yarn build
sam build
sam deploy
```

## Local Testing

You can test the Lambda function locally using SAM:

```bash
yarn build
sam build
sam local start-api
```

Then make requests to `http://localhost:3000/merge`

## Example Usage

### Direct JBrowse Integration (Simplest)

Just pass the Lambda URL directly to JBrowse:

```javascript
const lambdaUrl = 'https://your-api.amazonaws.com/Prod/merge'
const config1 = 'https://genomes.jbrowse.org/ucsc/GCF_950023065.1/config.json'
const config2 = 'https://genomes.jbrowse.org/ucsc/GCF_950005125.1/config.json'

const mergedConfigUrl = `${lambdaUrl}?configUrls=${encodeURIComponent(config1)},${encodeURIComponent(config2)}&sessionType=synteny`

const jbrowseUrl = `https://jbrowse.org/code/jb2/latest/?config=${encodeURIComponent(mergedConfigUrl)}`

window.open(jbrowseUrl, '_blank')
```

**Result URL:**
```
https://jbrowse.org/code/jb2/latest/?config=https%3A%2F%2Fyour-api.amazonaws.com%2FProd%2Fmerge%3FconfigUrls%3D...
```

JBrowse fetches the merged config directly from your Lambda!

### Integration with Synteny Page

```javascript
// In synteny.astro
launchButton.addEventListener('click', () => {
  const lambdaUrl = 'https://your-api.amazonaws.com/Prod/merge'
  const config1 = `https://genomes.jbrowse.org/ucsc/${selectedSpecies1}/config.json`
  const config2 = `https://genomes.jbrowse.org/ucsc/${selectedSpecies2}/config.json`

  const mergedConfigUrl = `${lambdaUrl}?configUrls=${encodeURIComponent(config1)},${encodeURIComponent(config2)}&sessionType=synteny`

  const jbrowseUrl = `https://jbrowse.org/code/jb2/latest/?config=${encodeURIComponent(mergedConfigUrl)}`

  window.open(jbrowseUrl, '_blank')
})
```

## License

MIT
