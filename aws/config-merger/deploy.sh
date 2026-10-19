#!/bin/bash

set -e

echo "Bundling TypeScript (esbuild)..."
pnpm build

echo "Building SAM application..."
sam build

echo "Deploying to AWS..."
# Self-contained (no samconfig.toml needed); extra args pass through.
sam deploy \
  --stack-name jbrowse-config-merger \
  --region us-east-1 \
  --resolve-s3 \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  "$@"

echo "Deployment complete!"
