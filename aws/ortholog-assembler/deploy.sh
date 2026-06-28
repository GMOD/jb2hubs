#!/bin/bash

set -e

echo "Bundling TypeScript (esbuild)..."
yarn build

echo "Building SAM application..."
sam build

echo "Deploying to AWS..."
# First run: `sam deploy --guided` to create samconfig.toml (set NcbiApiKey via
# --parameter-overrides NcbiApiKey=... if you have one).
sam deploy

echo "Deployment complete!"
