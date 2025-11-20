# Quick Start Guide

## 5-Minute Setup

### 1. Install Dependencies

```bash
cd aws/config-merger
yarn install
```

### 2. Build the Code

```bash
yarn build
```

This bundles everything into a single `dist/index.mjs` ES module file using esbuild.

### 3. Test It Works

```bash
yarn test
```

You should see all tests passing.

## Deploy to AWS (Optional)

If you want to deploy the Lambda function:

```bash
# Make sure AWS CLI is configured
aws configure

# Deploy
./deploy.sh
```

Follow the prompts. SAM will output your API URL at the end.

## Use Without Deployment

The client-side fallback works without any deployment:

```typescript
// In your Astro/React/etc component
import { mergeConfigs } from '@/lib/configMerger'

const merged = await mergeConfigs([
  'https://example.com/config1.json',
  'https://example.com/config2.json'
])
```

No environment variable needed - it just works!

## Test the Lambda Locally

```bash
yarn build
sam build
sam local start-api
```

Then test with curl:

```bash
curl -X POST http://localhost:3000/merge \
  -H "Content-Type: application/json" \
  -d @example-request.json
```

## Connect to Website

After deployment, add to `website/.env`:

```bash
PUBLIC_CONFIG_MERGER_API_URL=https://your-api-id.execute-api.region.amazonaws.com/Prod/merge
```

Done! The website will now use your Lambda function.

## Troubleshooting

### Tests Fail

```bash
# Clean and rebuild
rm -rf node_modules dist
yarn install
yarn build
yarn test
```

### SAM Deploy Fails

Make sure you have:
- AWS CLI installed and configured
- AWS SAM CLI installed
- Appropriate IAM permissions

### Lambda Timeout

Increase timeout in `template.yaml`:

```yaml
Globals:
  Function:
    Timeout: 60  # Change from 30 to 60
```

### CORS Issues

Check that your API Gateway has CORS enabled. The template already configures this, but you can verify in the AWS Console.

## What's Next?

- Read `ARCHITECTURE.md` for technical details
- Read `README.md` for API documentation
- Integrate with `synteny.astro` page
- Monitor in CloudWatch after deployment
