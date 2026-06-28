#!/bin/bash

set -e

echo "Bundling TypeScript (esbuild)..."
pnpm build

echo "Building SAM application..."
sam build

echo "Deploying to AWS..."
# Self-contained (no samconfig.toml needed). Pass extra args through, e.g.
#   ./deploy.sh --parameter-overrides NcbiApiKey=YOUR_KEY
sam deploy \
  --stack-name jbrowse-ortholog-assembler \
  --region us-east-2 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  "$@"

echo "Deployment complete!"
