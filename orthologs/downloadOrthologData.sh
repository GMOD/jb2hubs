#!/bin/bash
#
# downloadOrthologData.sh
#
# Reproducibly downloads the NCBI Gene ortholog + symbol source tables used to
# build cross-species gene mappings. Both come from the NCBI Gene FTP and are
# refreshed there regularly:
#
#   gene_orthologs.gz  cols: tax_id, GeneID, relationship, Other_tax_id, Other_GeneID
#   gene_info.gz       cols: tax_id, GeneID, Symbol, ... (used for GeneID -> Symbol)
#
# Files are large (gene_info.gz is multi-GB); downloads are atomic + skipped
# when already present. Set REPROCESS=true to force a re-download.
#
# Usage: ./downloadOrthologData.sh [outdir]
#   outdir: where to store the .gz files. Defaults to ORTHOLOG_DATA_DIR.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

OUTDIR="${1:-${ORTHOLOG_DATA_DIR:-/mnt/sdb/cdiesh/orthologs}}"
ensure_dir "$OUTDIR"

NCBI_BASE="https://ftp.ncbi.nlm.nih.gov/gene/DATA"

download() {
  local name="$1"
  local dest="$OUTDIR/$name"
  if [[ -z "${REPROCESS:-}" && -f "$dest" ]]; then
    log "$name already present, skipping (REPROCESS=true to force)"
  else
    log "Downloading $name..."
    # shellcheck disable=SC2015
    wget -q -O "$dest.tmp" "$NCBI_BASE/$name" && mv "$dest.tmp" "$dest" || {
      rm -f "$dest.tmp"
      echo "ERROR: failed to download $NCBI_BASE/$name" >&2
      exit 1
    }
  fi
}

download gene_orthologs.gz
download gene_info.gz

log "Ortholog source data ready in $OUTDIR"
