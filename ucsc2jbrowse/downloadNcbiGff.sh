#!/bin/bash

#
# downloadNcbiGff.sh
#
# Downloads and processes the GFF for hs1.
#

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
source "$SCRIPT_DIR/common.sh"

# --- Main Script ---

GFF_DIR="$SCRIPT_DIR/gff"
mkdir -p "$GFF_DIR"

if [ ! -f "$GFF_DIR/hs1.gff.gz.csi" ]; then
  log "Downloading and processing hs1 GFF..."
  datasets download genome accession GCF_009914755.1 --include gff3,seq-report -f --filename "$GFF_DIR/ncbi_dataset.zip"
  unzip -o "$GFF_DIR/ncbi_dataset.zip" -d "$GFF_DIR"
  jbrowse sort-gff "$GFF_DIR/ncbi_dataset/data/GCF_009914755.1/genomic.gff" | bgzip -@2 >"$GFF_DIR/hs1.gff.gz"
  tabix -C "$GFF_DIR/hs1.gff.gz"
fi

log "Adding hs1 GFF track to JBrowse..."
jbrowse add-track "$GFF_DIR/hs1.gff.gz" --force --trackId hs1-ncbiRefSeqGff --name "NCBI RefSeq - RefSeq All (GFF)" --category "Genes and Gene Predictions" --out "$UCSC_RESULTS_DIR/hs1/" --load copy --indexFile "$GFF_DIR/hs1.gff.gz.csi"

log "Indexing hs1 GFF track..."
jbrowse text-index --force --out "$UCSC_RESULTS_DIR/hs1" --tracks hs1-ncbiRefSeqGff
