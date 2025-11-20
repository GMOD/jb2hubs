# JBrowse Config Merger Architecture

## Overview

This AWS Lambda function provides a service for merging multiple JBrowse 2 configuration files. It's designed to support synteny views and multi-assembly comparisons in JBrowse 2.

## Architecture

```
┌─────────────────┐
│   Web Browser   │
│  (synteny.astro)│
└────────┬────────┘
         │
         │ POST /merge
         │
         ▼
┌─────────────────┐
│  API Gateway    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Lambda Function│
│  (config-merger)│
└────────┬────────┘
         │
         ├─► Fetch config from URL 1
         ├─► Fetch config from URL 2
         ├─► Merge assemblies
         ├─► Merge tracks
         ├─► Add synteny tracks (optional)
         └─► Return merged config
```

## Components

### 1. Lambda Function (`src/index.ts`)

Main entry point that:
- Handles API Gateway events
- Validates requests
- Fetches configs from URLs or accepts them directly
- Delegates to ConfigMerger
- Returns merged config or error response

### 2. Config Merger (`src/merger.ts`)

Core merging logic:
- **mergeAssemblies()**: Combines assemblies from multiple configs, deduplicating by name
- **mergeTracks()**: Combines tracks, optionally adds synteny tracks
- **mergeTextSearchAdapters()**: Combines search adapters
- **createDefaultSession()**: Creates linear or synteny view sessions

### 3. Types (`src/types.ts`)

TypeScript interfaces for:
- JBrowse configs
- Assemblies
- Tracks
- Synteny tracks
- Merge options

### 4. Tests (`src/merger.test.ts`)

Comprehensive test suite using Vitest covering:
- Basic merging scenarios
- Deduplication
- Synteny track filtering
- Session creation
- Error handling

## Merging Strategy

### Assemblies

Assemblies are merged by name. If two configs have an assembly with the same name, only the first one encountered is included.

```typescript
config1.assemblies = [{ name: "assembly1", ... }]
config2.assemblies = [{ name: "assembly2", ... }]

merged.assemblies = [
  { name: "assembly1", ... },
  { name: "assembly2", ... }
]
```

### Tracks

Tracks are merged by `trackId`. Each unique track is included once.

```typescript
config1.tracks = [{ trackId: "track1", assemblyNames: ["assembly1"], ... }]
config2.tracks = [{ trackId: "track2", assemblyNames: ["assembly2"], ... }]

merged.tracks = [
  { trackId: "track1", ... },
  { trackId: "track2", ... }
]
```

### Synteny Tracks

When `includeSyntenyTracks` is enabled:
1. Filter synteny tracks to only include those with both assemblies in the merged config
2. Add filtered synteny tracks to the tracks array
3. Set type to `SyntenyTrack`

```typescript
syntenyTracks = [
  {
    trackId: "synteny1-2",
    assemblyNames: ["assembly1", "assembly2"],
    adapter: { type: "PairwiseIndexedPAFAdapter", ... }
  }
]
```

### Default Session

When `createDefaultSession` is enabled:

**Linear Mode** (single assembly or default):
```json
{
  "defaultSession": {
    "name": "assembly1",
    "views": [{
      "type": "LinearGenomeView",
      "id": "initialView"
    }]
  }
}
```

**Synteny Mode** (2+ assemblies):
```json
{
  "defaultSession": {
    "name": "Synteny - assembly1 vs assembly2",
    "views": [{
      "type": "LinearSyntenyView",
      "id": "syntenyView",
      "views": [
        { "type": "LinearGenomeView", "id": "view-0" },
        { "type": "LinearGenomeView", "id": "view-1" }
      ]
    }]
  }
}
```

## API Contract

### Request

```typescript
{
  // Option 1: Fetch from URLs
  configUrls?: string[]

  // Option 2: Provide configs directly
  configs?: JBrowseConfig[]

  // Merge options
  options?: {
    includeSyntenyTracks?: boolean
    syntenyTracks?: SyntenyTrack[]
    createDefaultSession?: boolean
    sessionType?: 'linear' | 'synteny'
  }
}
```

### Response (Success)

```typescript
{
  assemblies: Assembly[]
  tracks: Track[]
  aggregateTextSearchAdapters: AggregateTextSearchAdapter[]
  defaultSession?: DefaultSession
}
```

### Response (Error)

```typescript
{
  error: string
  message: string
}
```

## Client-Side Fallback

The `website/src/lib/configMerger.ts` provides a client-side implementation that:
1. Checks for `PUBLIC_CONFIG_MERGER_API_URL` environment variable
2. If set, calls the Lambda function
3. If not set, performs merging client-side in the browser
4. Uses the same merging strategy for consistency

## Deployment

### AWS Resources Created

- Lambda Function: `jbrowse-config-merger`
- API Gateway: REST API with `/merge` endpoint
- CloudWatch Log Group: `/aws/lambda/jbrowse-config-merger`
- IAM Role: Auto-generated execution role

### Environment

- Runtime: Node.js 20.x
- Memory: 512 MB
- Timeout: 30 seconds
- Architecture: x86_64

## Performance Considerations

### Lambda Function

- Cold start: ~1-2 seconds
- Warm execution: ~100-300ms
- Config fetch time: depends on config size and network
- Typical total time: 1-3 seconds

### Client-Side Fallback

- No cold start
- Depends on browser performance
- Subject to CORS restrictions
- Typical time: 500ms-2s

## Security

### CORS

The Lambda function enables CORS for all origins (`*`). In production, consider:
- Restricting to your domain
- Using API Gateway resource policies
- Implementing authentication

### Input Validation

Currently validates:
- Request body presence
- Either `configUrls` or `configs` required
- Config URL fetch errors

Consider adding:
- URL allowlist/blocklist
- Config size limits
- Rate limiting
- Authentication tokens

## Future Enhancements

1. **Caching**: Cache frequently merged config combinations
2. **Config Validation**: Validate JBrowse config schema
3. **Track Filtering**: Allow filtering tracks by category
4. **Session Customization**: More options for default session
5. **Config Optimization**: Remove unused tracks/assemblies
6. **Batch Merging**: Support merging 3+ configs efficiently
7. **Websocket Support**: For real-time config updates

## Monitoring

### CloudWatch Metrics

- Invocation count
- Error count
- Duration
- Throttles

### Logging

All logs go to CloudWatch Logs group:
`/aws/lambda/jbrowse-config-merger`

Log retention: 7 days (configurable in `template.yaml`)

## Cost Estimation

Based on AWS Lambda pricing (us-east-1):

- Free tier: 1M requests/month, 400,000 GB-seconds
- Per request: $0.0000002
- Per GB-second: $0.0000166667

Example costs for 100K requests/month (beyond free tier):
- Requests: 100,000 × $0.0000002 = $0.02
- Compute: 100,000 × 0.5 GB × 2s × $0.0000166667 = $1.67
- **Total: ~$1.69/month**

API Gateway additional cost: $3.50 per million requests
