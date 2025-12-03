#!/bin/bash

set -e

echo "Building TypeScript..."
yarn build

echo "Building SAM application..."
sam build

echo "Deploying to AWS..."
sam deploy

echo "Deployment complete!"
