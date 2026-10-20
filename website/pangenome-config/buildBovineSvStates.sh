#!/bin/bash
# Builds and publishes the structural-state sidecar of the cattle callset, to
# s3://jbrowse.org/pangenome/bovine-arsucd12/sv-states/, in the row format
# buildHprcSvStates.sh writes and `pangenomeSvStates.ts` reads.
#
# - **The callset is `vg deconstruct -a` over Leonard et al.'s minigraph
#   GFAs**, one haploid column per assembly, so each assembly is one
#   haplotype, named by its code (ANG, BIS, …).
# - **Only the top level is kept.** `-a` writes every nested snarl beside its
#   parent, so a nested record repeats what its parent's allele already
#   holds. A nested record whose parent has no record would stay, as in HPRC,
#   and the build reports how many did.
# - **An inversion is an ALT whose traversal (AT) walks a node backwards**:
#   minigraph writes no INV flag.
# - **Nothing is restored.** No vcfbub ran over this callset, so no parent is
#   missing and every no call is `.`.
#
# The object name carries FORMAT, the row format HPRC's sidecar shares, so a
# change to what a row means publishes beside the file deployed pages still
# read; the upload copies and never deletes.
#
# Usage: website/pangenome-config/buildBovineSvStates.sh
#   BOVINE_SV_STATES_DIR  work dir (default /mnt/sdb/cdiesh/bovineSvStates)
#   PUBLISH=0             build and stop before the upload
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

WORK="${BOVINE_SV_STATES_DIR:-/mnt/sdb/cdiesh/bovineSvStates}"
FORMAT=v2
DEST=jbrowse-data:jbrowse.org/pangenome/bovine-arsucd12/sv-states
PACKER="$(pwd)/../generatePangenomeSvStates.ts"
VCF=https://jbrowse.org/demos/bovine_pangenome/bovine-arsucd12-minigraph.vcf.gz
NAME="$(basename "${VCF%.vcf.gz}").sv-states.$FORMAT"

assert_bgzip_toolchain
mkdir -p "$WORK/out"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building $NAME in $WORK from $VCF"

LOCAL_VCF="$WORK/$(basename "$VCF")"
for suffix in '' .tbi; do
  if [ ! -f "$LOCAL_VCF$suffix" ]; then
    curl -fsS -o "$LOCAL_VCF$suffix.part" "$VCF$suffix"
    mv "$LOCAL_VCF$suffix.part" "$LOCAL_VCF$suffix"
  fi
done
bcftools query -l "$LOCAL_VCF" >"$WORK/samples.txt"
bcftools query -f '%ID\n' "$LOCAL_VCF" | sort -u >"$WORK/ids.txt"

bcftools query -i 'STRLEN(REF)>=50 || STRLEN(ALT)>=50' \
  -f '%CHROM\t%POS\t%ID\t%INFO/LV\t%INFO/PS\t%INFO/AT\t%REF\t%ALT[\t%GT]\n' \
  "$LOCAL_VCF" |
  node "$PACKER" --haploid --traversals "$WORK/samples.txt" >"$WORK/rows.tsv.part"
mv "$WORK/rows.tsv.part" "$WORK/rows.tsv"
: >"$WORK/orphans.tsv"
awk -F'\t' -v OFS='\t' -v idsFile="$WORK/ids.txt" -v orphans="$WORK/orphans.tsv" '
  BEGIN { while ((getline id < idsFile) > 0) { ids[id] = 1 } }
  $5 == "0" { print $1, $2, $3, $4, $7, $8; next }
  !($6 in ids) { print $1, $2, $3, $4, $7, $8; print > orphans }' \
  "$WORK/rows.tsv" | LC_ALL=C sort -k1,1V -k2,2n -k3,3n >"$WORK/kept.tsv"
if [ ! -s "$WORK/kept.tsv" ]; then
  echo "no structural record kept from $VCF" >&2
  exit 1
fi
log "$(wc -l <"$WORK/rows.tsv") structural records, $(wc -l <"$WORK/kept.tsv") kept, $(wc -l <"$WORK/orphans.tsv") of them nested under a parent with no record"

{
  printf '#haplotypes\t%s\n' "$(paste -sd, "$WORK/samples.txt")"
  cat "$WORK/kept.tsv"
} | bgzip -c >"$WORK/out/$NAME.tsv.gz.part"
mv "$WORK/out/$NAME.tsv.gz.part" "$WORK/out/$NAME.tsv.gz"
tabix -f -0 -s 1 -b 2 -e 3 -c '#' "$WORK/out/$NAME.tsv.gz"
log "$(gzip -dc "$WORK/out/$NAME.tsv.gz" | tail -n +2 | wc -l) records over $(wc -l <"$WORK/samples.txt") haplotypes, $(stat -c %s "$WORK/out/$NAME.tsv.gz") bytes"

cat >"$WORK/out/$NAME.README.txt" <<EOF
Bovine super-pangenome structural states, one row per record, for JBrowse 2
===========================================================================

A derivative of Leonard et al. 2023 (Genome Biology 24:128, Zenodo 7737904,
CC-BY 4.0), redistributed under the same licence. $NAME.tsv.gz holds every
top-level record of

  $VCF

(vg deconstruct -a over the published minigraph graphs, one haploid column per
assembly) with an allele at least 50 bp long, as

  chrom  start(0-based)  end  id  states  genotypes

where genotypes is one character per assembly, in the order the first line
names, and states says what each character does to the reference's structure:
0 its own structure, v inverted (an allele whose traversal walks a node
backwards), . no call, and 1-9a-zA-Z a size change to two significant figures
(1:-1700 is a 1.7 kb deletion), ranked by how many assemblies carry it. A
nested record is dropped where its parent has a record. Rebuilt by
website/pangenome-config/buildBovineSvStates.sh in
https://github.com/GMOD/jb2hubs with $(bcftools --version | head -1),
$(bgzip --version | head -1) and node $(node --version).
EOF

if [ "${PUBLISH:-1}" = 0 ]; then
  log "PUBLISH=0: built $WORK/out/$NAME.tsv.gz, nothing uploaded"
  exit 0
fi

changed=$(rclone_copy_with_indexes "$WORK/out" "$DEST" "$NAME.*")
log "$changed object(s) changed under $DEST"
if [ "$changed" -gt 0 ]; then
  cloudfront_invalidate "/pangenome/bovine-arsucd12/sv-states/$NAME*"
fi
