# Integration with Synteny Page

## Simplified Architecture

```
User selects species 1 & 2
         ↓
Launch button clicked
         ↓
Build Lambda URL with query params
         ↓
Pass Lambda URL directly to JBrowse
         ↓
JBrowse fetches config from Lambda
         ↓
Lambda merges configs on-the-fly
         ↓
✅ Both species loaded in synteny view!
```

## Key Advantage

**No intermediate steps!** JBrowse fetches the merged config directly from your Lambda URL.

## Implementation in synteny.astro

### Simple Implementation

```typescript
<script define:vars={{ /* ... */ }}>
  const LAMBDA_URL = 'https://your-api.amazonaws.com/Prod/merge'

  launchButton.addEventListener('click', () => {
    if (selectedSpecies1 && selectedSpecies2) {
      // Build config URLs
      const config1 = `https://hgdownload.soe.ucsc.edu/hubs/${getPath(selectedSpecies1)}/config.json`
      const config2 = `https://hgdownload.soe.ucsc.edu/hubs/${getPath(selectedSpecies2)}/config.json`

      // Build Lambda URL with query params
      const mergedConfigUrl =
        `${LAMBDA_URL}?` +
        `configUrls=${encodeURIComponent(config1)},${encodeURIComponent(config2)}` +
        `&sessionType=synteny` +
        `&createDefaultSession=true`

      // Pass Lambda URL to JBrowse
      const jbrowseUrl =
        `https://jbrowse.org/code/jb2/latest/?config=${encodeURIComponent(mergedConfigUrl)}`

      window.open(jbrowseUrl, '_blank')
    }
  })

  // Helper to build hub path from assembly name
  function getPath(assembly) {
    // e.g., GCF_950023065.1 -> GCF/950/023/065/GCF_950023065.1
    if (assembly.startsWith('GCF_') || assembly.startsWith('GCA_')) {
      const parts = assembly.split('_')
      const prefix = parts[0]
      const nums = parts[1].split('.')
      const num = nums[0]
      return `${prefix}/${num.substring(0,3)}/${num.substring(3,6)}/${num.substring(6,9)}/${assembly}`
    }
    return assembly
  }
</script>
```

## What Happens

1. **User clicks "Launch Synteny View"**
2. **JavaScript builds URL:**
   ```
   https://your-api.amazonaws.com/Prod/merge?configUrls=https://...config1.json,https://...config2.json&sessionType=synteny
   ```
3. **Opens JBrowse:**
   ```
   https://jbrowse.org/code/jb2/latest/?config=https://your-api...
   ```
4. **JBrowse fetches from Lambda**
5. **Lambda merges and returns config**
6. **JBrowse displays synteny view**

## Configuration

No environment variables needed! Just hardcode your Lambda URL in the script:

```javascript
const LAMBDA_URL = 'https://abc123.execute-api.us-east-1.amazonaws.com/Prod/merge'
```

## Query Parameters You Can Use

```javascript
const params = new URLSearchParams({
  configUrls: `${config1},${config2}`,           // Required: comma-separated
  sessionType: 'synteny',                         // Optional: 'linear' or 'synteny'
  createDefaultSession: 'true',                   // Optional: default true
  includeSyntenyTracks: 'false',                  // Optional: default false
})

const mergedConfigUrl = `${LAMBDA_URL}?${params}`
```

## Testing

### Local Testing

```bash
# Terminal 1: Start Lambda
cd aws/config-merger
yarn build
sam build
sam local start-api

# Terminal 2: Update synteny.astro
const LAMBDA_URL = 'http://localhost:3000/merge'

# Start website
cd website
yarn dev
```

### Production Testing

```bash
# Deploy Lambda
cd aws/config-merger
./deploy.sh

# Copy the API URL from output
# Update synteny.astro with your API URL
const LAMBDA_URL = 'https://abc123.execute-api.us-east-1.amazonaws.com/Prod/merge'
```

## Full Example

```html
<script>
  const LAMBDA_URL = 'https://abc123.execute-api.us-east-1.amazonaws.com/Prod/merge'

  launchButton.addEventListener('click', () => {
    if (!selectedSpecies1 || !selectedSpecies2) {
      statusDiv.textContent = 'Please select both species'
      return
    }

    statusDiv.textContent = 'Opening JBrowse...'

    try {
      // Build config URLs
      const baseUrl = 'https://hgdownload.soe.ucsc.edu/hubs'
      const config1 = `${baseUrl}/${getHubPath(selectedSpecies1)}/config.json`
      const config2 = `${baseUrl}/${getHubPath(selectedSpecies2)}/config.json`

      // Build merged config URL
      const mergedConfigUrl =
        `${LAMBDA_URL}?configUrls=${encodeURIComponent(config1)},${encodeURIComponent(config2)}&sessionType=synteny`

      // Open JBrowse
      const jbrowseUrl =
        `https://jbrowse.org/code/jb2/latest/?config=${encodeURIComponent(mergedConfigUrl)}`

      window.open(jbrowseUrl, '_blank')

      statusDiv.textContent = ''
    } catch (error) {
      statusDiv.textContent = `Error: ${error.message}`
    }
  })

  function getHubPath(assembly) {
    // Convert GCF_950023065.1 to GCF/950/023/065/GCF_950023065.1
    if (assembly.startsWith('GCF_') || assembly.startsWith('GCA_')) {
      const [prefix, rest] = assembly.split('_')
      const [num] = rest.split('.')
      return `${prefix}/${num.slice(0,3)}/${num.slice(3,6)}/${num.slice(6,9)}/${assembly}`
    }
    return assembly
  }
</script>
```

## Benefits

1. **Simple**: Just build a URL, no API calls needed
2. **Fast**: JBrowse fetches directly from Lambda
3. **No CORS issues**: Lambda handles CORS
4. **Cacheable**: JBrowse can cache the merged config
5. **Clean**: No blob URLs or intermediate steps
6. **Shareable**: Users can bookmark the JBrowse URL

## URL Example

The final JBrowse URL looks like:

```
https://jbrowse.org/code/jb2/latest/?config=https%3A%2F%2Fabc123.execute-api.us-east-1.amazonaws.com%2FProd%2Fmerge%3FconfigUrls%3Dhttps%253A%252F%252Fhgdownload.soe.ucsc.edu%252Fhubs%252FGCF%252F950%252F023%252F065%252FGCF_950023065.1%252Fconfig.json%252Chttps%253A%252F%252Fhgdownload.soe.ucsc.edu%252Fhubs%252FGCF%252F950%252F005%252F125%252FGCF_950005125.1%252Fconfig.json%26sessionType%3Dsynteny
```

Users can bookmark this URL to return to the exact synteny view!

## Troubleshooting

### Lambda URL not working

Test it directly:
```bash
curl "https://your-lambda-url/merge?configUrls=https://hgdownload.soe.ucsc.edu/hubs/GCF/950/023/065/GCF_950023065.1/config.json,https://hgdownload.soe.ucsc.edu/hubs/GCF/950/005/125/GCF_950005125.1/config.json&sessionType=synteny"
```

Should return a JSON config.

### JBrowse shows error

Check browser console for CORS issues. Lambda should return proper CORS headers (already configured).

### Config URLs wrong

Double-check the path format. It should match your hub structure on hgdownload.soe.ucsc.edu.
