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

### Endpoint

```
POST /merge
```

### Request Body

```json
{
  "configUrls": [
    "https://genomes.jbrowse.org/ucsc/GCF_950023065.1/config.json",
    "https://genomes.jbrowse.org/ucsc/GCF_950005125.1/config.json"
  ],
  "options": {
    "includeSyntenyTracks": true,
    "syntenyTracks": [...],
    "createDefaultSession": true,
    "sessionType": "synteny"
  }
}
```

Or provide configs directly:

```json
{
  "configs": [
    { "assemblies": [...], "tracks": [...] },
    { "assemblies": [...], "tracks": [...] }
  ],
  "options": {
    "createDefaultSession": true,
    "sessionType": "linear"
  }
}
```

### Options

- `includeSyntenyTracks` (boolean): Include synteny tracks in the merged config
- `syntenyTracks` (array): Array of synteny track definitions to include
- `createDefaultSession` (boolean): Create a default session in the merged config
- `sessionType` ('linear' | 'synteny'): Type of session to create

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

### Run Tests

```bash
yarn test
```

Tests are written using Vitest.

## Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SAM CLI installed

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

### From Browser

```javascript
const response = await fetch('https://your-api-gateway-url/merge', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    configUrls: [
      'https://genomes.jbrowse.org/ucsc/GCF_950023065.1/config.json',
      'https://genomes.jbrowse.org/ucsc/GCF_950005125.1/config.json'
    ],
    options: {
      createDefaultSession: true,
      sessionType: 'synteny'
    }
  })
})

const mergedConfig = await response.json()
```

### Integration with Synteny Page

```javascript
// In synteny.astro
const configUrl1 = `https://genomes.jbrowse.org/ucsc/${selectedSpecies1}/config.json`
const configUrl2 = `https://genomes.jbrowse.org/ucsc/${selectedSpecies2}/config.json`

const response = await fetch('https://your-api-gateway-url/merge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    configUrls: [configUrl1, configUrl2],
    options: {
      includeSyntenyTracks: true,
      syntenyTracks: relevantSyntenyTracks,
      createDefaultSession: true,
      sessionType: 'synteny'
    }
  })
})

const mergedConfig = await response.json()
const configBlob = new Blob([JSON.stringify(mergedConfig)], { type: 'application/json' })
const configUrl = URL.createObjectURL(configBlob)
const jbrowseUrl = `https://jbrowse.org/code/jb2/latest/?config=${encodeURIComponent(configUrl)}`
```

## License

MIT
