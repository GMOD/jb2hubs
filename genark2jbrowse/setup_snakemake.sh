#!/bin/bash
#
# setup_snakemake.sh
#
# Install and configure Snakemake for the genark2jbrowse POC.
#
# This script:
# 1. Checks for conda/mamba installation
# 2. Creates a conda environment with Snakemake and dependencies
# 3. Prints activation instructions
#
# Usage:
#   bash setup_snakemake.sh
#

set -e

echo "=========================================="
echo "Snakemake POC Setup"
echo "=========================================="
echo

# Check for conda or mamba
if command -v mamba &> /dev/null; then
    PKG_MANAGER="mamba"
    echo "✓ Found mamba (faster conda)"
elif command -v conda &> /dev/null; then
    PKG_MANAGER="conda"
    echo "✓ Found conda"
else
    echo "✗ Neither conda nor mamba found."
    echo
    echo "Please install either:"
    echo "  - Anaconda: https://www.anaconda.com/download"
    echo "  - Miniconda: https://docs.conda.io/en/latest/miniconda.html"
    echo "  - Mambaforge: https://github.com/conda-forge/miniforge#mambaforge"
    echo
    exit 1
fi

echo

# Create environment
ENV_NAME="snakemake_poc"

echo "Creating conda environment '$ENV_NAME'..."
echo "This may take a minute..."
echo

$PKG_MANAGER create -n "$ENV_NAME" -c conda-forge -c bioconda \
    snakemake-minimal=8.5.3 \
    graphviz \
    -y

if [ $? -ne 0 ]; then
    echo
    echo "✗ Failed to create environment"
    exit 1
fi

echo
echo "=========================================="
echo "✓ Installation complete!"
echo "=========================================="
echo
echo "To activate the environment, run:"
echo "  conda activate $ENV_NAME"
echo
echo "Then you can run Snakemake:"
echo "  snakemake --cores 4                    # Run workflow"
echo "  snakemake --dry-run --reason          # Show execution plan"
echo "  snakemake --dag | dot -Tpng > dag.png  # Visualize DAG"
echo
echo "To deactivate when done:"
echo "  conda deactivate"
echo
echo "=========================================="
