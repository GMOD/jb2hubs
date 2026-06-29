#!/usr/bin/env bash
#
# Create the conda/mamba environment with every tool the build needs. All are on
# bioconda. Run once on the build host (e.g. ada), then `conda activate
# pangenome-build` before run.sh — or just let run.sh activate it.
set -euo pipefail

ENV_NAME="${1:-pangenome-build}"
CONDA="$(command -v mamba || command -v conda || true)"
[ -n "$CONDA" ] || { echo "ERROR: need conda or mamba on PATH" >&2; exit 1; }

"$CONDA" create -y -n "$ENV_NAME" -c conda-forge -c bioconda \
  ncbi-datasets-cli wfmash impg samtools abpoa unzip python

echo "Created env '$ENV_NAME'. Activate with: conda activate $ENV_NAME"
