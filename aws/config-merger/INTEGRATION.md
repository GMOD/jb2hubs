# Integration with Synteny Page

## Current Flow (Before Config Merger)

```
User selects species 1 & 2
         ↓
Launch button clicked
         ↓
Opens: https://jbrowse.org/code/jb2/latest/?config=https://genomes.jbrowse.org/ucsc/GCF_123.json
         ↓
JBrowse loads only species 1
         ↓
❌ No synteny view
❌ Species 2 not loaded
```

## New Flow (With Config Merger)

```
User selects species 1 & 2
         ↓
Launch button clicked
         ↓
JavaScript calls mergeConfigs()
         ↓
    ┌─────────────────────┐
    │ Environment check   │
    └──────────┬──────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
[Lambda URL set]  [No Lambda URL]
       │                │
       ▼                ▼
  Call Lambda     Client-side merge
       │                │
       └────────┬───────┘
                ▼
    Merged config received
    {
      assemblies: [species1, species2],
      tracks: [...all tracks...],
      syntenyTracks: [species1↔species2]
    }
                ↓
    Create Blob URL
                ↓
    Open JBrowse with merged config
                ↓
    ✅ Both species loaded
    ✅ Synteny view ready
    ✅ All tracks available
```

## Implementation in synteny.astro

### Update the Script Section

```typescript
// Add import at top of script
import { mergeConfigs } from '../lib/configMerger'

// Replace the existing launch button handler
launchButton.addEventListener('click', async () => {
  if (selectedSpecies1 && selectedSpecies2) {
    launchButton.disabled = true
    statusDiv.textContent = 'Preparing synteny view...'

    try {
      // Get config URLs
      const configUrl1 = `https://genomes.jbrowse.org/ucsc/${selectedSpecies1}/config.json`
      const configUrl2 = `https://genomes.jbrowse.org/ucsc/${selectedSpecies2}/config.json`

      // Find relevant synteny tracks
      const matchingTracks = syntenyTracks.filter(
        track =>
          track.assemblyNames.includes(selectedSpecies1) &&
          track.assemblyNames.includes(selectedSpecies2)
      )

      // Merge configs
      const mergedConfig = await mergeConfigs(
        [configUrl1, configUrl2],
        {
          includeSyntenyTracks: true,
          syntenyTracks: matchingTracks,
          createDefaultSession: true,
          sessionType: 'synteny'
        }
      )

      // Create blob URL for merged config
      const configBlob = new Blob(
        [JSON.stringify(mergedConfig)],
        { type: 'application/json' }
      )
      const configBlobUrl = URL.createObjectURL(configBlob)

      // Open JBrowse with merged config
      const jbrowseUrl = `https://jbrowse.org/code/jb2/latest/?config=${encodeURIComponent(configBlobUrl)}`

      statusDiv.textContent = 'Opening JBrowse...'
      window.open(jbrowseUrl, '_blank')

      // Cleanup
      setTimeout(() => {
        URL.revokeObjectURL(configBlobUrl)
        statusDiv.textContent = ''
        launchButton.disabled = false
      }, 1000)

    } catch (error) {
      console.error('Error launching synteny view:', error)
      statusDiv.textContent = `Error: ${error.message}`
      launchButton.disabled = false
    }
  }
})
```

## Benefits of This Approach

### 1. True Synteny View
- Both assemblies loaded simultaneously
- Synteny tracks automatically included
- Default synteny view session created

### 2. Flexibility
- Works with or without Lambda
- Client-side fallback for development
- Production-ready Lambda for scale

### 3. Better UX
- Single click launches complete view
- No manual track configuration needed
- Proper error handling and feedback

### 4. Maintainable
- Centralized config merging logic
- Tested and documented
- Type-safe TypeScript

## Configuration Options

### For Development (No Lambda)

Just use it - no setup required!

```typescript
// .env file not needed
// Merging happens client-side automatically
```

### For Production (With Lambda)

```bash
# website/.env
PUBLIC_CONFIG_MERGER_API_URL=https://xyz.execute-api.us-east-1.amazonaws.com/Prod/merge
```

### For Custom Behavior

```typescript
const mergedConfig = await mergeConfigs(
  [configUrl1, configUrl2],
  {
    // Include synteny tracks
    includeSyntenyTracks: true,
    syntenyTracks: myCustomTracks,

    // Create default session
    createDefaultSession: true,

    // Choose session type
    sessionType: 'synteny', // or 'linear'
  }
)
```

## Testing the Integration

### 1. Test Client-Side (No Deployment)

```bash
cd website
# Don't set PUBLIC_CONFIG_MERGER_API_URL
yarn dev
```

Navigate to `/synteny`, select species, click launch.

### 2. Test Lambda Locally

```bash
# Terminal 1: Start Lambda
cd aws/config-merger
yarn build
sam build
sam local start-api

# Terminal 2: Run website
cd website
echo "PUBLIC_CONFIG_MERGER_API_URL=http://localhost:3000/merge" > .env
yarn dev
```

Navigate to `/synteny`, select species, click launch.

### 3. Test Production Lambda

```bash
cd aws/config-merger
./deploy.sh

# Copy the API URL from output
cd ../website
echo "PUBLIC_CONFIG_MERGER_API_URL=https://your-api-url/Prod/merge" > .env
yarn dev
```

## Troubleshooting

### Config Blob URL Issues

If JBrowse can't load the config:

```typescript
// Try this alternative approach
const configStr = JSON.stringify(mergedConfig)
const configBase64 = btoa(configStr)
const jbrowseUrl = `https://jbrowse.org/code/jb2/latest/?config=data:application/json;base64,${configBase64}`
```

### CORS Issues with Lambda

Make sure your Lambda has CORS headers (already configured in template.yaml):

```yaml
# In template.yaml
Events:
  MergeConfigs:
    Type: Api
    Properties:
      Path: /merge
      Method: POST
  OptionsRequest:  # Important for CORS
    Type: Api
    Properties:
      Path: /merge
      Method: OPTIONS
```

### Synteny Tracks Not Showing

Make sure the synteny tracks have the correct format:

```typescript
const syntenyTrack = {
  trackId: "unique-id",
  name: "Display Name",
  assemblyNames: [selectedSpecies1, selectedSpecies2], // Must match exactly
  adapter: {
    type: "PairwiseIndexedPAFAdapter",
    // ... adapter config
  }
}
```

## Next Steps

1. Update `synteny.astro` with the new code
2. Test in development
3. Deploy Lambda when ready
4. Update production environment variables
5. Monitor usage in CloudWatch
