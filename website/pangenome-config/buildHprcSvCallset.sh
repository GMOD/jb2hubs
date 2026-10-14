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
# - **Same-site alleles of one event merge back** (collapseSiteAlleles.py).
#   The graph makes each distinct traversal an allele, so the FLNA/EMD
#   inversion was 64 records of one or two carriers each. Alleles at one POS
#   and REF length, of one SV type and within 5% in size, become one record;
#   deletions also need leftovers within 50 bp of each other. The merge leaves
#   C4's deletion and insertion apart. checkSiteAlleles.py audits every merge
#   and stops the build on a problem, and bcftools +fill-tags recomputes
#   AC/AF/AN. Format v3 is 696,361 records where v2 was 1,460,052.
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
FORMAT=v3
DEST=jbrowse-data:jbrowse.org/pangenome/hprc-grch38/sv-callset
VCF=$(jq -r '.tracks[] | select(.type == "VariantTrack") | .adapter.uri' hprc-grch38.json | head -1)
NAME="$(basename "${VCF%.wave.vcf.gz}").sv.$FORMAT"
PARTS="$WORK/chroms/$FORMAT/$(basename "$VCF")"

assert_bgzip_toolchain
mkdir -p "$PARTS" "$WORK/out"
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
  local c=$1 out="$PARTS/$1.vcf.gz" tmp="$PARTS/$1.tmp" report
  [ -f "$out" ] && return
  mkdir -p "$tmp"
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
      # vcfwave writes the flag bare and as INV=YES (174 and 157 records)
      $8 ~ /(^|;)INV(=YES)?(;|$)/ { $8 = $8 ";SVTYPE=INV" }
      { print }' >"$tmp/split.vcf"
  python3 -I collapseSiteAlleles.py "$tmp/members.tsv" <"$tmp/split.vcf" >"$tmp/collapsed.vcf"
  report=$(python3 -I checkSiteAlleles.py "$tmp/split.vcf" "$tmp/collapsed.vcf" "$tmp/members.tsv" 2>&1) || {
    echo "$c: checkSiteAlleles.py failed, $tmp kept: $report" >&2
    return 1
  }
  echo "$c: $report"
  bcftools +fill-tags "$tmp/collapsed.vcf" -Oz -o "$out.part" -- -t AC,AF,AN
  mv "$out.part" "$out"
  rm -rf "$tmp"
}
export -f split_chrom
export WORK LOCAL_VCF PARTS

xargs -P "$JOBS" -n 1 bash -c 'split_chrom "$@"' _ <"$WORK/chroms.txt"

sed "s#^#$PARTS/#; s#\$#.vcf.gz#" "$WORK/chroms.txt" >"$WORK/parts.txt"
bcftools concat --naive -f "$WORK/parts.txt" -Oz -o "$WORK/out/$NAME.vcf.gz.part"
mv "$WORK/out/$NAME.vcf.gz.part" "$WORK/out/$NAME.vcf.gz"
tabix -f -p vcf "$WORK/out/$NAME.vcf.gz"
log "$(bcftools index -n "$WORK/out/$NAME.vcf.gz") records, $(stat -c %s "$WORK/out/$NAME.vcf.gz") bytes"

cat >"$WORK/out/$NAME.README.txt" <<EOF
$NAME.vcf.gz is the HPRC release 2 minigraph-cactus callset
$VCF
with one allele per record (bcftools norm -m -any), only the alleles that
change the length by 50 bp or more or that vcfwave flags as an inversion,
CHM13's column removed, and SVTYPE=INV added where vcfwave flags an
inversion. Alleles at one POS and REF length, of one SV type and within 5% in
size (deletions also leaving sequence within 50 bp of each other's), are then
merged into one record: a haplotype carries it if it carried any of them, and
NumCollapsed counts them. AC, AF and AN are recomputed after the merge. Built
by jb2hubs website/pangenome-config/buildHprcSvCallset.sh with
$(bcftools --version | head -1) and $(python3 --version).
EOF

if [ "${PUBLISH:-1}" = 0 ]; then
  log "PUBLISH=0: built $WORK/out/$NAME.vcf.gz, nothing uploaded"
  exit 0
fi

changed=$(rclone_copy_with_indexes "$WORK/out" "$DEST" "$NAME.*")
log "$changed object(s) changed under $DEST"
if [ "$changed" -gt 0 ]; then
  cloudfront_invalidate "/pangenome/hprc-grch38/sv-callset/$NAME*"
fi
