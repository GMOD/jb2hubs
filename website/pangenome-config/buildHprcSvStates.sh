#!/bin/bash
# Builds and publishes the structural-state sidecar of the HPRC callset, to
# s3://jbrowse.org/pangenome/hprc-grch38/sv-states/. It is one row per
# structural record — where it is, what each state does to the reference's
# structure, and one character per haplotype — tabix-indexed, 18 MB for the
# genome. Any window is then a small ranged read, which is what lets a page or a
# view ask "which ways do these haplotypes differ here" for a region nobody
# precomputed. `website/src/components/pangenomeSvStates.ts` has the rules and
# reads it back.
#
# Two things it is careful about, both measured on 2026-09-17:
#
# - **Every structural record is kept, not only LV=0.** vcfbub pops a parent
#   snarl carrying an allele over 100 kb and keeps its children, so at such a
#   site the LV=1 records ARE the top level. All 425 parents that nested records
#   name genome-wide are absent from the file, and filtering on LV=0 drops, for
#   instance, the 1.7 kb deletion 190 of 461 haplotypes carry at HP. A nested
#   record whose parent IS present would duplicate it, so those are dropped.
# - **CHM13 is left out.** It is in the callset as a haploid column and in the
#   graph as a second reference, not a haplotype to compare against the others.
#
# On the build box, not in run.sh: it downloads the 2.3 GB callset once.
#
# Usage: website/pangenome-config/buildHprcSvStates.sh
#   HPRC_SV_STATES_DIR  work dir (default /mnt/sdb/cdiesh/hprcSvStates)
#   JOBS                chromosomes at once (default 12)
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

WORK="${HPRC_SV_STATES_DIR:-/mnt/sdb/cdiesh/hprcSvStates}"
JOBS="${JOBS:-12}"
DEST=jbrowse-data:jbrowse.org/pangenome/hprc-grch38/sv-states
PACKER="$(pwd)/../generatePangenomeSvStates.ts"
# The callset the config's own variant track names, so one file names it.
VCF=$(jq -r '.tracks[] | select(.type == "VariantTrack") | .adapter.uri' hprc-grch38.json | head -1)
NAME="$(basename "${VCF%.wave.vcf.gz}").sv-states"

assert_bgzip_toolchain
mkdir -p "$WORK/rows" "$WORK/present" "$WORK/out"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building $NAME in $WORK from $VCF"

for suffix in '' .tbi; do
  if [ ! -f "$WORK/wave.vcf.gz$suffix" ]; then
    curl -fsS -C - -o "$WORK/wave.vcf.gz$suffix.part" "$VCF$suffix"
    mv "$WORK/wave.vcf.gz$suffix.part" "$WORK/wave.vcf.gz$suffix"
  fi
done
bcftools query -l "$WORK/wave.vcf.gz" >"$WORK/samples.txt"
grep -v '^CHM13$' "$WORK/samples.txt" | sed 's/$/#1/;p;s/#1$/#2/' >"$WORK/haplotypes.txt"
tabix -l "$WORK/wave.vcf.gz" >"$WORK/chroms.txt"

pack_chrom() {
  set -euo pipefail
  local c=$1
  # A structural record: an allele at least 50 bp longer or shorter than the
  # reference is the tier the graph itself records.
  bcftools query -r "$c" -i 'STRLEN(REF)>=50 || STRLEN(ALT)>=50' \
    -f '%CHROM\t%POS\t%ID\t%INFO/LV\t%INFO/PS\t%INFO/INV\t%REF\t%ALT[\t%GT]\n' \
    "$WORK/wave.vcf.gz" |
    node "$PACKER" "$WORK/samples.txt" >"$WORK/rows/$c.tsv.part"
  mv "$WORK/rows/$c.tsv.part" "$WORK/rows/$c.tsv"
  # Which parent snarls the nested records name have a record of their own,
  # under that ID or as the origin of a vcfwave decomposition.
  awk -F'\t' '$5 != "0" {print $6}' "$WORK/rows/$c.tsv" | sort -u >"$WORK/present/$c.named"
  if [ -s "$WORK/present/$c.named" ]; then
    bcftools query -r "$c" -f '%ID\n%INFO/ORIGIN\n' "$WORK/wave.vcf.gz" |
      grep -Fxf "$WORK/present/$c.named" | sort -u >"$WORK/present/$c.txt" || true
  else
    : >"$WORK/present/$c.txt"
  fi
  echo "  $c: $(wc -l <"$WORK/rows/$c.tsv") records, $(wc -l <"$WORK/present/$c.named") parents named, $(wc -l <"$WORK/present/$c.txt") of them present"
}
export -f pack_chrom
export WORK PACKER

xargs -P "$JOBS" -I{} bash -c 'pack_chrom {}' <"$WORK/chroms.txt"

{
  printf '#haplotypes\t%s\n' "$(paste -sd, "$WORK/haplotypes.txt")"
  while read -r c; do
    awk -F'\t' 'NR == FNR { present[$0] = 1; next }
      $5 == "0" || !($6 in present) { print $1 "\t" $2 "\t" $3 "\t" $4 "\t" $7 "\t" $8 }' \
      "$WORK/present/$c.txt" "$WORK/rows/$c.tsv" | LC_ALL=C sort -k2,2n
  done <"$WORK/chroms.txt"
} | bgzip -c >"$WORK/out/$NAME.tsv.gz.part"
mv "$WORK/out/$NAME.tsv.gz.part" "$WORK/out/$NAME.tsv.gz"
tabix -f -0 -s 1 -b 2 -e 3 -c '#' "$WORK/out/$NAME.tsv.gz"
log "$(gzip -dc "$WORK/out/$NAME.tsv.gz" | tail -n +2 | wc -l) records over $(wc -l <"$WORK/haplotypes.txt") haplotypes, $(stat -c %s "$WORK/out/$NAME.tsv.gz") bytes"

cat >"$WORK/out/README.txt" <<EOF
HPRC release 2 structural states, one row per record, for JBrowse 2
==================================================================

A derivative of HPRC data, not original data. $NAME.tsv.gz holds every record of

  $VCF

with an allele at least 50 bp longer or shorter than the reference, as

  chrom  start(0-based)  end  id  states  genotypes

where genotypes is one character per haplotype, in the order the first line
names, and states says what each character does to the reference's structure:
0 its own structure, . not placed in that haplotype, v inverted, and 1-9a-zA-Z a
size change to two significant figures (1:-1700 is a 1.7 kb deletion), ranked by
how many haplotypes carry it. A record nested under a parent snarl that is
itself in the file is dropped; one whose parent vcfbub removed is kept, since it
is the top level where it sits. CHM13 is left out.

HPRC data is released under CC0; see
https://github.com/human-pangenomics/hpp_pangenome_resources for the release
and its terms. Rebuilt by website/pangenome-config/buildHprcSvStates.sh in
https://github.com/GMOD/jb2hubs with $(bcftools --version | head -1),
$(bgzip --version | head -1) and node $(node --version).
EOF

changed=$(rclone_sync_with_indexes "$WORK/out" "$DEST")
log "$changed object(s) changed under $DEST"
if [ "$changed" -gt 0 ]; then
  cloudfront_invalidate "/pangenome/hprc-grch38/sv-states/*"
fi
