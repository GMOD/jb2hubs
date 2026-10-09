#!/bin/bash
# Builds and publishes the HPRC callset the /pangenomes matrix reads, to
# s3://jbrowse.org/pangenome/hprc-grch38/sv-callset/: the release's
# wave.vcf.gz with one allele per record and its structural alleles alone.
#
# - **One allele per record** (`bcftools norm -m -any`). The release merges
#   every allele starting at a position into one record, and the matrix's
#   `svType` color classes a record: C4's 33 kb module record held a deletion
#   and an insertion, so its 130 carriers drew "Other / mixed", and CFHR's
#   record read "Deletion" for 111 haplotypes carrying a same-length rewrite.
#   Split, a haplotype carrying another allele is reference in this record.
# - **Structural alleles only**: a length change of 50 bp or more, or an
#   inversion, so a window is a fraction of the release's bytes. Format v1 kept
#   any allele whose REF or ALT reached 50 bp, and 190,441 of its 1,650,445
#   records were long same-length or near-same-length substitutions (CFHR's
#   84,685 bp REF to an 84,685 bp ALT), which no SV type names and the matrix
#   drew as "(no value)".
# - **vcfwave's INV flag is stated as `SVTYPE=INV`**, the field the display's
#   `svType` preset reads. Nothing else is added: an allele 50 bp longer or
#   shorter than REF is an insertion or deletion by the preset's own rule.
# - **CHM13 is left out**, as the sidecar leaves it: a second reference in the
#   graph, not a haplotype to compare.
#
# The object name carries FORMAT, so a change to what a record means publishes
# beside the file deployed pages still read; the upload copies and never
# deletes. On the build box, not in run.sh: it reads the 2.3 GB release
# callset, cached with the sidecar's.
#
# Usage: website/pangenome-config/buildHprcSvCallset.sh
#   HPRC_SV_CALLSET_DIR  work dir (default /mnt/sdb/cdiesh/hprcSvCallset)
#   HPRC_SV_STATES_DIR   where buildHprcSvStates.sh caches the release callset
#   JOBS                 chromosomes at once (default 12)
#   PUBLISH=0            build and stop before the upload
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

WORK="${HPRC_SV_CALLSET_DIR:-/mnt/sdb/cdiesh/hprcSvCallset}"
CACHE="${HPRC_SV_STATES_DIR:-/mnt/sdb/cdiesh/hprcSvStates}"
JOBS="${JOBS:-12}"
FORMAT=v2
DEST=jbrowse-data:jbrowse.org/pangenome/hprc-grch38/sv-callset
VCF=$(jq -r '.tracks[] | select(.type == "VariantTrack") | .adapter.uri' hprc-grch38.json | head -1)
NAME="$(basename "${VCF%.wave.vcf.gz}").sv-split.$FORMAT"

assert_bgzip_toolchain
mkdir -p "$WORK/chroms/$FORMAT" "$WORK/out"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building $NAME in $WORK from $VCF"

LOCAL_VCF="$CACHE/$(basename "$VCF")"
mkdir -p "$CACHE"
for suffix in '' .tbi; do
  if [ ! -f "$LOCAL_VCF$suffix" ]; then
    curl -fsS -C - -o "$LOCAL_VCF$suffix.part" "$VCF$suffix"
    mv "$LOCAL_VCF$suffix.part" "$LOCAL_VCF$suffix"
  fi
done
tabix -l "$LOCAL_VCF" >"$WORK/chroms.txt"

split_chrom() {
  set -euo pipefail
  local c=$1 out="$WORK/chroms/$FORMAT/$1.vcf.gz"
  [ -f "$out" ] && return
  bcftools view -r "$c" -s ^CHM13 --force-samples -Ou "$LOCAL_VCF" |
    bcftools norm -m -any -Ou |
    bcftools view -i 'abs(STRLEN(ALT)-STRLEN(REF))>=50 || INFO/INV=1' -Ov |
    awk 'BEGIN { OFS = "\t" }
      /^##INFO=<ID=INV,/ {
        print
        print "##INFO=<ID=SVTYPE,Number=1,Type=String,Description=\"INV where vcfwave flags an inversion\">"
        next
      }
      /^#/ { print; next }
      $8 ~ /(^|;)INV(;|$)/ { $8 = $8 ";SVTYPE=INV" }
      { print }' |
    bcftools view -Oz -o "$out.part"
  mv "$out.part" "$out"
}
export -f split_chrom
export WORK LOCAL_VCF FORMAT

xargs -P "$JOBS" -n 1 bash -c 'split_chrom "$@"' _ <"$WORK/chroms.txt"

sed "s#^#$WORK/chroms/$FORMAT/#; s#\$#.vcf.gz#" "$WORK/chroms.txt" >"$WORK/parts.txt"
bcftools concat --naive -f "$WORK/parts.txt" -Oz -o "$WORK/out/$NAME.vcf.gz.part"
mv "$WORK/out/$NAME.vcf.gz.part" "$WORK/out/$NAME.vcf.gz"
tabix -f -p vcf "$WORK/out/$NAME.vcf.gz"
log "$(bcftools index -n "$WORK/out/$NAME.vcf.gz") records, $(stat -c %s "$WORK/out/$NAME.vcf.gz") bytes"

cat >"$WORK/out/$NAME.README.txt" <<EOF
$NAME.vcf.gz is the HPRC release 2 minigraph-cactus callset
$VCF
with one allele per record (bcftools norm -m -any), only the alleles that
change the length by 50 bp or more or that vcfwave flags as an inversion,
CHM13's column removed, and SVTYPE=INV added
where vcfwave flags an inversion. Built by jb2hubs
website/pangenome-config/buildHprcSvCallset.sh with $(bcftools --version | head -1).
EOF

if [ "${PUBLISH:-1}" = 0 ]; then
  log "PUBLISH=0: built $WORK/out/$NAME.vcf.gz, nothing uploaded"
  exit 0
fi

# Copies, with the index revalidated on every read as rclone_sync_with_indexes
# has it. A sync would delete the earlier format's file, which deployed pages
# read.
publish() {
  local log_file
  log_file=$(mktemp)
  rclone copy -c -v "$@" "$WORK/out" "$DEST" \
    --s3-storage-class INTELLIGENT_TIERING 2>&1 | tee "$log_file" >&2
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
    rm -f "$log_file"
    return 1
  fi
  count_rclone_changes "$log_file"
  rm -f "$log_file"
}
data=$(publish --include "$NAME.vcf.gz" --include "$NAME.README.txt")
index=$(publish --include "$NAME.vcf.gz.tbi" --header-upload "Cache-Control: no-cache")
changed=$((data + index))
log "$changed object(s) changed under $DEST"
if [ "$changed" -gt 0 ]; then
  cloudfront_invalidate "/pangenome/hprc-grch38/sv-callset/$NAME*"
fi
