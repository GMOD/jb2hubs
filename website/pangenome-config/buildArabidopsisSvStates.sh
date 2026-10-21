#!/bin/bash
# Builds and publishes the structural-state sidecar of the Arabidopsis graph, to
# s3://jbrowse.org/pangenome/arabidopsis-tair10/sv-states/, in the row format
# buildHprcSvStates.sh writes and `pangenomeSvStates.ts` reads.
#
# - **The graph records no paths, so the build maps each assembly back onto
#   it.**
#   `minigraph -cxasm --call` writes the walk an assembly takes through every
#   bubble, `mgutils.js merge` joins the 27 call files, and
#   `mgutils-es6.js merge2vcf -r0` writes them as one VCF, one haploid column
#   per assembly: the SV-calling route in minigraph's README.
# - **TAIR10 is the reference column, not a haplotype.** The VCF drops it, and
#   a record whose TAIR10 call is not the reference allele, since its allele 0
#   would then be some other walk.
# - **The alleles are symbolic**: `ALEN` gives each allele's length and
#   `AWALK` its walk, which the packer reads with `--symbolic` and
#   `--traversals` (an inversion walks a node backwards, as in cattle).
# - **Bubbles do not nest**, so every record is kept and no parent is
#   restored. A bubble whose span overlaps the one before starts at that one's
#   end segment, so the two sit side by side in the graph; the build counts
#   them.
#
# Every step keeps its output in the work dir and skips itself when that output
# is there, so a rerun after a failure starts where it stopped. The object name
# carries FORMAT, the row format HPRC's sidecar shares; the upload copies and
# never deletes.
#
# Usage: website/pangenome-config/buildArabidopsisSvStates.sh
#   ARABIDOPSIS_SV_STATES_DIR  work dir (default /mnt/sdb/cdiesh/arabidopsisSvStates)
#   ARABIDOPSIS_GRAPH_DIR      the rGFA and *.pansn.fa (default ~/1001g/graph)
#   MINIGRAPH_JOBS, MINIGRAPH_THREADS  concurrent calls and threads each (2, 6)
#   PUBLISH=0                  build and stop before the upload
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

WORK="${ARABIDOPSIS_SV_STATES_DIR:-/mnt/sdb/cdiesh/arabidopsisSvStates}"
GRAPH_DIR="${ARABIDOPSIS_GRAPH_DIR:-$HOME/1001g/graph}"
GFA="$GRAPH_DIR/1001g.rgfa"
MGUTILS="${MGUTILS_DIR:-$HOME/src/minigraph/misc}"
FORMAT=v2
DEST=jbrowse-data:jbrowse.org/pangenome/arabidopsis-tair10/sv-states
PACKER="$(pwd)/../generatePangenomeSvStates.ts"
BASENAME=arabidopsis-tair10-minigraph
NAME="$BASENAME.sv-states.$FORMAT"
VCF="$WORK/$BASENAME.vcf.gz"
# TAIR10 first for merge2vcf's -r0, then the lane order of the published
# README: Col-0's own accession, then by admixture group.
SAMPLES=(TAIR10 Col-0.6909 KBS-Mac-74 Sq-1 TueWa1-2 HSm Stiav-1 Fly2-2 T690
  Nyl-7 TRA-01 Angit-1 Lerik1-4 IP-Cum-1 IP-Pva-1 IP-Gra-0 IP-Ven-0 Qar-8a
  Noveg-3 35-1 85-3 Areeiro-1 ET-86.4 Elh-2 Rabacal-1 Taz-0 Tnz-1)

assert_bgzip_toolchain
mkdir -p "$WORK/calls" "$WORK/out"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building $NAME in $WORK from $GFA"

call_one() {
  local sample="$1" out="$WORK/calls/$1.call.bed"
  [ -s "$out" ] && return 0
  minigraph -cxasm --call -t"${MINIGRAPH_THREADS:-6}" "$GFA" \
    "$GRAPH_DIR/$sample.pansn.fa" >"$out.part" 2>"$WORK/calls/$sample.log"
  mv "$out.part" "$out"
}
export -f call_one
export WORK GRAPH_DIR GFA MINIGRAPH_THREADS
printf '%s\n' "${SAMPLES[@]}" >"$WORK/samples.txt"
if ! xargs -P "${MINIGRAPH_JOBS:-2}" -I{} bash -c 'call_one {}' <"$WORK/samples.txt"; then
  echo "minigraph --call failed; see $WORK/calls/*.log" >&2
  exit 1
fi
lines=$(for s in "${SAMPLES[@]}"; do wc -l <"$WORK/calls/$s.call.bed"; done | sort -u)
if [ "$(wc -l <<<"$lines")" -ne 1 ] || [ "$lines" -eq 0 ]; then
  echo "the call files differ in line count ($(paste -sd, <<<"$lines")), so their bubbles do not line up" >&2
  exit 1
fi
log "${#SAMPLES[@]} call files of $lines bubbles each"

if [ ! -s "$VCF" ]; then
  awk '/^>/ { if (name) print name, len; name = $1; sub(/^>/, "", name); sub(/.*#/, "", name); len = 0; next }
    { len += length($0) } END { print name, len }' "$GRAPH_DIR/TAIR10.pansn.fa" |
    awk '{ printf "##contig=<ID=%s,length=%d>\n", $1, $2 }' >"$WORK/header.txt"
  cat >>"$WORK/header.txt" <<'EOF'
##INFO=<ID=END,Number=1,Type=Integer,Description="End of the bubble">
##INFO=<ID=AN,Number=1,Type=Integer,Description="Number of called alleles">
EOF
  calls=()
  for s in "${SAMPLES[@]}"; do calls+=("$WORK/calls/$s.call.bed"); done
  {
    cat "$WORK/header.txt"
    paste "${calls[@]}" | k8 "$MGUTILS/mgutils.js" merge -s "$WORK/samples.txt" - |
      sed 's/^TAIR10#1#//'
  } >"$WORK/merged.bed"
  k8 "$MGUTILS/mgutils-es6.js" merge2vcf -r0 -a "${#SAMPLES[@]}" "$WORK/merged.bed" |
    bcftools annotate --set-id '%INFO/VS%INFO/VE' -Ou |
    bcftools view -i 'GT[0]="ref"' -Ou |
    bcftools view -s ^TAIR10 -Ou |
    bcftools sort -Oz -o "$VCF.part"
  mv "$VCF.part" "$VCF"
  tabix -f -p vcf "$VCF"
  rm "$WORK/merged.bed"
fi
records=$(bcftools index -n "$VCF")
log "$records records in $VCF, of $lines bubbles"

bcftools query -l "$VCF" >"$WORK/haplotypes.txt"
bcftools query -i 'MAX(INFO/ALEN)>=50' \
  -f '%CHROM\t%POS\t%ID\t.\t.\t%INFO/AWALK\t%INFO/ALEN\t%ALT[\t%GT]\n' "$VCF" |
  node "$PACKER" --haploid --traversals --symbolic "$WORK/haplotypes.txt" |
  cut -f1-4,7,8 | LC_ALL=C sort -k1,1V -k2,2n -k3,3n >"$WORK/kept.tsv"
if [ ! -s "$WORK/kept.tsv" ]; then
  echo "no structural record kept from $VCF" >&2
  exit 1
fi
overlaps=$(awk -F'\t' '
  { match($4, /^[<>][^<>]+/); source = substr($4, 2, RLENGTH - 1); sink = substr($4, RLENGTH + 2) }
  $1 == chrom && $2 < end { n++; if (source != prevSink) apart++ }
  $1 != chrom || $3 > end { end = $3 }
  { chrom = $1; prevSink = sink }
  END { printf "%d overlapping the one before, %d of them not at its end segment", n, apart }' "$WORK/kept.tsv")
log "$(wc -l <"$WORK/kept.tsv") structural records kept, $overlaps"

{
  printf '#haplotypes\t%s\n' "$(paste -sd, "$WORK/haplotypes.txt")"
  cat "$WORK/kept.tsv"
} | bgzip -c >"$WORK/out/$NAME.tsv.gz.part"
mv "$WORK/out/$NAME.tsv.gz.part" "$WORK/out/$NAME.tsv.gz"
tabix -f -0 -s 1 -b 2 -e 3 -c '#' "$WORK/out/$NAME.tsv.gz"
log "$(gzip -dc "$WORK/out/$NAME.tsv.gz" | tail -n +2 | wc -l) records over $(wc -l <"$WORK/haplotypes.txt") haplotypes, $(stat -c %s "$WORK/out/$NAME.tsv.gz") bytes"

cat >"$WORK/out/$NAME.README.txt" <<EOF
Arabidopsis 1001 Genomes Plus structural states, one row per bubble, for JBrowse 2
==================================================================================

A derivative of the 26 1001 Genomes Plus Phase 1 assemblies (Igolkina et al.,
Nature Genetics 2025, doi:10.1038/s41588-025-02293-0) and the minigraph graph
of them on TAIR10 published at

  https://jbrowse.org/demos/arabidopsis_pangenome/$BASENAME.rgfa.gz

Each assembly was mapped back onto the graph with minigraph -cxasm --call, the
calls merged with mgutils.js merge and mgutils-es6.js merge2vcf -r0, and
TAIR10's column dropped. $NAME.tsv.gz holds every bubble with an allele at
least 50 bp long, as

  chrom  start(0-based)  end  id  states  genotypes

where id is the bubble's start and end segments, genotypes is one character
per accession, in the order the first line names, and states says what each
character does to TAIR10's structure: 0 its own structure, v inverted (an
allele whose walk steps through a segment backwards), . no call (the
assembly does not align across the bubble), and 1-9a-zA-Z a size change to
two significant figures (1:-1700 is a 1.7 kb deletion), ranked by how many
accessions carry it. Rebuilt by website/pangenome-config/buildArabidopsisSvStates.sh
in https://github.com/GMOD/jb2hubs with minigraph $(minigraph --version),
$(bcftools --version | head -1), $(bgzip --version | head -1) and node
$(node --version).
EOF

if [ "${PUBLISH:-1}" = 0 ]; then
  log "PUBLISH=0: built $WORK/out/$NAME.tsv.gz, nothing uploaded"
  exit 0
fi

changed=$(rclone_copy_with_indexes "$WORK/out" "$DEST" "$NAME.*")
log "$changed object(s) changed under $DEST"
if [ "$changed" -gt 0 ]; then
  cloudfront_invalidate "/pangenome/arabidopsis-tair10/sv-states/$NAME*"
fi
