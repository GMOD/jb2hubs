#!/bin/bash
# Builds and publishes the gene models hprc-grch38.json's haplotype tracks name,
# to s3://jbrowse.org/pangenome/hprc-grch38/genes/. A haplotype lane reads its
# genes from these; without them it reads "no annotation".
#
# HPRC publishes a CAT annotation per release 2 haplotype, as plain gzip in gene
# order that no index can be built over. Each is reduced here to one transcript
# per gene in BED12, sorted, bgzipped and tabix-indexed:
# website/generatePangenomeGeneModels.ts has the rules. That is 3.4 MB where the
# annotation is 129 MB bgzipped, because a lane draws one model per gene and
# CAT repeats a ~30-field attribute block on every exon row.
#
# Which haplotypes is whatever the config names: run
# website/generatePangenomeHaplotypes.ts first. On the build box, not in run.sh:
# the first run downloads ~50 GB of CAT GFF3. The download and the BED are kept,
# and each BED is stamped with the source_tree_hash of the converter that wrote
# it, so a rerun rebuilds what is new or was written by other rules. Publish
# these before upload.sh publishes a config that names them.
#
# Usage: website/pangenome-config/buildHprcGenes.sh
#   HPRC_GENES_DIR  work dir (default /mnt/sdb/cdiesh/hprcCatGenes)
#   JOBS            haplotypes processed at once (default 8)
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

WORK="${HPRC_GENES_DIR:-/mnt/sdb/cdiesh/hprcCatGenes}"
JOBS="${JOBS:-8}"
CAT_INDEX=https://raw.githubusercontent.com/human-pangenomics/hprc_intermediate_assembly/main/data_tables/annotation/cat/cat_genes_hprc_r2_v1.3.index.csv
DEST=jbrowse-data:jbrowse.org/pangenome/hprc-grch38/genes
CONVERTER="$(pwd)/../generatePangenomeGeneModels.ts"
CONVERTER_HASH=$(source_tree_hash ../.. \
  website/generatePangenomeGeneModels.ts \
  website/src/components/pangenomeGeneModels.ts)

assert_bgzip_toolchain
mkdir -p "$WORK/raw" "$WORK/genes" "$WORK/stamps"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building gene models in $WORK"

curl -fsSL -o "$WORK/cat_index.csv" "$CAT_INDEX"

build_genes() {
  set -euo pipefail
  local assembly=$1 url=$2
  local raw="$WORK/raw/$assembly.cat.gff3.gz"
  local out="$WORK/genes/$assembly.genes.bed.gz"
  local stamp="$WORK/stamps/$assembly.converter" built=''
  if [ -f "$stamp" ]; then
    read -r built <"$stamp"
  fi
  if [ -f "$out" ] && [ -f "$out.tbi" ] && [ "$built" = "$CONVERTER_HASH" ]; then
    return
  fi
  if [ ! -f "$raw" ]; then
    curl -fsS -o "$raw.part" "$url"
    mv "$raw.part" "$raw"
  fi
  node "$CONVERTER" "$raw" | LC_ALL=C sort -k1,1 -k2,2n | bgzip -c >"$out.part"
  tabix -f -p bed "$out.part"
  mv "$out.part.tbi" "$out.tbi"
  mv "$out.part" "$out"
  echo "$CONVERTER_HASH" >"$stamp"
  echo "  $assembly: $(gzip -dc "$out" | wc -l) genes"
}
export -f build_genes
export WORK CONVERTER CONVERTER_HASH

# `HG00097.1` is the assembly for PanSN `HG00097#1`; the index is keyed by
# sample and haplotype number.
jq -r '.tracks[] | select(.trackId | endswith("_cat_genes")) | .assemblyNames[0]' \
  hprc-grch38.json |
  while read -r assembly; do
    s3=$(awk -F, -v s="${assembly%.*}" -v h="${assembly##*.}" \
      '$1==s && $2==h {print $4}' "$WORK/cat_index.csv")
    if [ -z "$s3" ]; then
      echo "no CAT annotation indexed for $assembly" >&2
      exit 1
    fi
    printf '%s\n%s\n' "$assembly" \
      "https://s3-us-west-2.amazonaws.com/${s3#s3://}"
  done |
  xargs -P "$JOBS" -n 2 bash -c 'build_genes "$@"' _

cat >"$WORK/genes/README.txt" <<EOF
HPRC release 2 gene models, one transcript per gene per haplotype, for JBrowse 2
================================================================================

A redistribution of HPRC data, not original data. Each
<sample>.<haplotype>.genes.bed.gz is that haplotype's CAT annotation from the
release 2 index

  $CAT_INDEX

reduced to one transcript per gene (the longest coding sequence, else the
longest spliced length), genes spanning over 5 Mb dropped, as BED12 with the
gene name in the name column and the coding span as thickStart/thickEnd, sorted,
bgzipped and tabix-indexed. Contig names are the assembly's own, as the
annotation writes them. HPRC data is released under CC0; see
https://github.com/human-pangenomics/hpp_pangenome_resources for the release
and its terms.

Read by the haplotype lanes of https://jbrowse.org/pangenome/hprc-grch38/config.json.
Rebuilt by website/pangenome-config/buildHprcGenes.sh in
https://github.com/GMOD/jb2hubs with $(bgzip --version | head -1),
$(tabix --version | head -1) and node $(node --version).

Files
-----

$(cd "$WORK/genes" && for f in *.genes.bed.gz; do printf '  %s  %s bytes\n' "$f" "$(stat -c %s "$f")"; done)
EOF

changed=$(rclone_sync_with_indexes "$WORK/genes" "$DEST" --exclude "*.part")
log "$changed object(s) changed under $DEST"
if [ "$changed" -gt 0 ]; then
  cloudfront_invalidate "/pangenome/hprc-grch38/genes/*"
fi
