#!/bin/bash
# Builds and publishes the structural-state sidecar of the mouse strain graph,
# to s3://jbrowse.org/pangenome/mouse-mm39/sv-states/, in the row format
# buildHprcSvStates.sh writes and `pangenomeSvStates.ts` reads.
#
# - **The graph records no paths, so the build maps each strain back onto
#   it**, as buildArabidopsisSvStates.sh does: `minigraph -cxasm --call` per
#   assembly, then `mgutils.js merge` and `mgutils-es6.js merge2vcf -r0`
#   (`minigraphSvStates.sh`).
# - **The calls run per chromosome**, each strain's chromosome against that
#   chromosome's graph: the same FASTA and graph files
#   build_mouse_pangenome.sh (jbrowse-components) built the graph from, 379
#   small jobs in place of 19 whole-genome ones.
# - **A chromosome's segment ids are shifted by its rank times 10,000,000**,
#   as that script's concatenation numbers them, so a record's id names
#   segments of the published mouse-mm39-minigraph.rgfa.gz.
# - **mm39 is the reference column, not a haplotype**, dropped as TAIR10 is.
# - **C57BL_6J_T2T has no chrX**, so its chrX calls are written as no calls.
#   chrY holds mm39 alone and no bubble, so the build skips it.
#
# Every step keeps its output in the work dir and skips itself when that output
# is there, so a rerun after a failure starts where it stopped. The object name
# carries FORMAT, the row format HPRC's sidecar shares; the upload copies and
# never deletes.
#
# Usage: website/pangenome-config/buildMouseSvStates.sh
#   MOUSE_SV_STATES_DIR  work dir (default /mnt/sdb/cdiesh/mouseSvStates)
#   MOUSE_PANGENOME_DIR  build_mouse_pangenome.sh's outdir, with graph/ and
#                        chrom/ (default /mnt/sdb/cdiesh/mousePangenome)
#   MINIGRAPH_JOBS, MINIGRAPH_THREADS  concurrent calls and threads each (8, 2)
#   PUBLISH=0            build and stop before the upload
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh
source minigraphSvStates.sh

WORK="${MOUSE_SV_STATES_DIR:-/mnt/sdb/cdiesh/mouseSvStates}"
PANGENOME="${MOUSE_PANGENOME_DIR:-/mnt/sdb/cdiesh/mousePangenome}"
FORMAT=v2
DEST=jbrowse-data:jbrowse.org/pangenome/mouse-mm39/sv-states
BASENAME=mouse-mm39-minigraph
NAME="$BASENAME.sv-states.$FORMAT"
VCF="$WORK/$BASENAME.vcf.gz"
# In the concatenated graph's order, which sets each one's id offset.
CHROMS=(chr1 chr2 chr3 chr4 chr5 chr6 chr7 chr8 chr9 chr10 chr11 chr12 chr13
  chr14 chr15 chr16 chr17 chr18 chr19 chrX)
# mm39 first for merge2vcf's -r0, then the graph's construction order.
SAMPLES=(mm39 C57BL_6J_T2T CAST_EiJ_T2T C57BL_6NJ NZO_HlLtJ BALB_cJ FVB_NJ
  129S1_SvImJ C3H_HeJ AKR_J DBA_2J A_J LP_J NOD_ShiLtJ CBA_J CAST_EiJ WSB_EiJ
  JF1_MsJ PWK_PhJ)

assert_bgzip_toolchain
mkdir -p "$WORK/out"
for c in "${CHROMS[@]}"; do mkdir -p "$WORK/calls/$c"; done
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building $NAME in $WORK from $PANGENOME/graph"

call_one() {
  local c="$1" sample="$2" out="$WORK/calls/$1/$2.call.bed"
  [ -s "$out" ] && return 0
  minigraph -cxasm --call -t"${MINIGRAPH_THREADS:-2}" "$PANGENOME/graph/$c.gfa" \
    "$PANGENOME/chrom/$c/$sample.$c.fa" >"$out.part" 2>"$WORK/calls/$c/$sample.log"
  mv "$out.part" "$out"
}
export -f call_one
export WORK PANGENOME MINIGRAPH_THREADS
for c in "${CHROMS[@]}"; do
  for s in "${SAMPLES[@]}"; do
    if [ -s "$PANGENOME/chrom/$c/$s.$c.fa" ]; then echo "$c $s"; fi
  done
done >"$WORK/jobs.txt"
log "$(wc -l <"$WORK/jobs.txt") calls of ${#SAMPLES[@]} assemblies on ${#CHROMS[@]} chromosomes"
if ! xargs -P "${MINIGRAPH_JOBS:-8}" -L1 bash -c 'call_one "$@"' _ <"$WORK/jobs.txt"; then
  echo "minigraph --call failed; see $WORK/calls/*/*.log" >&2
  exit 1
fi

renumber() {
  perl -pe "s/([<>])s(\\d+)/\$1.'s'.(\$2 + $1 * 10000000)/ge"
}
calls=()
for s in "${SAMPLES[@]}"; do
  out="$WORK/calls/$s.call.bed"
  calls+=("$out")
  [ -s "$out" ] && continue
  k=0
  for c in "${CHROMS[@]}"; do
    k=$((k + 1))
    if [ -s "$WORK/calls/$c/$s.call.bed" ]; then
      renumber "$k" <"$WORK/calls/$c/$s.call.bed"
    else
      awk 'BEGIN { FS = OFS = "\t" } { $6 = "."; print }' "$WORK/calls/$c/mm39.call.bed" | renumber "$k"
    fi
  done >"$out.part"
  mv "$out.part" "$out"
done
lines=$(call_file_bubbles "${calls[@]}")
log "${#SAMPLES[@]} call files of $lines bubbles each"

if [ ! -s "$VCF" ]; then
  printf '%s\n' "${SAMPLES[@]}" >"$WORK/samples.txt"
  awk 'NR == FNR { keep[$1] = 1; next } $1 in keep' <(printf '%s\n' "${CHROMS[@]}") \
    "$PANGENOME/fasta/mm39.chrom.sizes" >"$WORK/contigs.txt"
  minigraph_calls_to_vcf "$VCF" "$WORK/samples.txt" "$WORK/contigs.txt" 'mm39#0#' "${calls[@]}"
fi
records=$(bcftools index -n "$VCF")
log "$records records in $VCF, of $lines bubbles"

pack_minigraph_sv_states "$VCF" "$WORK/out/$NAME.tsv.gz"

cat >"$WORK/out/$NAME.README.txt" <<EOF
Mouse strain pangenome structural states, one row per bubble, for JBrowse 2
===========================================================================

A derivative of the minigraph graph of 18 Mouse Genomes Project strain
assemblies on GRCm39 (mm39) published at

  https://jbrowse.org/demos/mouse_pangenome/$BASENAME.rgfa.gz

whose README.txt beside it names the assemblies and how the graph was built.
Each strain's chromosomes were mapped back onto that chromosome's graph with
minigraph -cxasm --call, the calls merged with mgutils.js merge and
mgutils-es6.js merge2vcf -r0, and mm39's column dropped. $NAME.tsv.gz holds
every bubble with an allele at least 50 bp long, as

  chrom  start(0-based)  end  id  states  genotypes

where id is the bubble's start and end segments in the published graph,
genotypes is one character per strain, in the order the first line names, and
states says what each character does to mm39's structure: 0 its own
structure, v inverted (an allele whose walk steps through a segment
backwards), . no call (the assembly does not align across the bubble, and
C57BL_6J_T2T throughout chrX, which it lacks), and 1-9a-zA-Z a size change to
two significant figures (1:-1700 is a 1.7 kb deletion), ranked by how many
strains carry it. Rebuilt by website/pangenome-config/buildMouseSvStates.sh in
https://github.com/GMOD/jb2hubs with minigraph $(minigraph --version),
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
  cloudfront_invalidate "/pangenome/mouse-mm39/sv-states/$NAME*"
fi
