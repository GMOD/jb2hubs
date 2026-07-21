#!/usr/bin/env bash
#
# Set up the build environment. Prefers the pggb Singularity sandbox (which also
# ships wfmash and impg) over conda. If conda is available it is used for the
# remaining tools (ncbi-datasets-cli, samtools, abpoa).
#
# Run once on the build host, then just use run.sh directly — it prepends
# pangenome-build/bin/ to PATH so the singularity shims are found automatically.
#
# Override sandbox path: PGGB_SANDBOX=/path/to/pggb_sandbox ./setup-env.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PGGB_SANDBOX="${PGGB_SANDBOX:-$HOME/pggb_sandbox}"

# Validate singularity + sandbox
if ! command -v singularity >/dev/null; then
  echo "ERROR: singularity not on PATH" >&2
  exit 1
fi
if [[ ! -d "$PGGB_SANDBOX" ]]; then
  echo "ERROR: pggb sandbox not found at $PGGB_SANDBOX" >&2
  echo "       Pull it with: singularity build --sandbox ~/pggb_sandbox docker://ghcr.io/pangenome/pggb:latest" >&2
  exit 1
fi

echo "Checking sandbox tools..."
for tool in pggb wfmash impg; do
  singularity exec "$PGGB_SANDBOX" "$tool" --version >/dev/null 2>&1 \
    || singularity exec "$PGGB_SANDBOX" "$tool" --help >/dev/null 2>&1 \
    || { echo "ERROR: '$tool' not found in sandbox $PGGB_SANDBOX" >&2; exit 1; }
  echo "  $tool: OK (via singularity)"
done

# Remaining tools via conda if available, otherwise just warn
CONDA="$(command -v mamba || command -v conda || true)"
if [[ -n "$CONDA" ]]; then
  ENV_NAME="${1:-pangenome-build}"
  "$CONDA" create -y -n "$ENV_NAME" -c conda-forge -c bioconda \
    ncbi-datasets-cli samtools abpoa unzip python
  echo "Created conda env '$ENV_NAME' for remaining tools."
  echo "Activate with: conda activate $ENV_NAME"
else
  echo "No conda/mamba found — skipping conda env."
  echo "Ensure these are on PATH before running: datasets samtools"
fi

echo
echo "Sandbox shims are in $DIR/bin — run.sh adds them to PATH automatically."
echo "PGGB_SANDBOX=$PGGB_SANDBOX"
