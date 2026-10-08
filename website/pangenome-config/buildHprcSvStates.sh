#!/bin/bash
# Builds and publishes the structural-state sidecar of the HPRC callset, to
# s3://jbrowse.org/pangenome/hprc-grch38/sv-states/: one tabix-indexed row per
# structural record, with what each state does to the reference's structure and
# one character per haplotype. `website/src/components/pangenomeSvStates.ts`
# has the rules and reads it back.
#
# - **Every structural record is kept, not only LV=0.** vcfbub removed each
#   snarl whose reference allele passes 100 kb and kept its children, so at such
#   a site the nested records are the wave callset's top level. A nested record
#   whose parent the wave callset has would duplicate it and is dropped.
# - **The removed parents are restored from the release's raw callset**, each
#   by a ranged read over its children, since a haplotype that bypasses a child
#   has no call there and the parent is the record saying what it carries
#   instead. The raw callset is 24 GB and is never downloaded.
# - **CHM13 is left out.** It is in the callset as a haploid column and in the
#   graph as a second reference, not a haplotype to compare against the others.
#
# The object name carries FORMAT, so a change to what a row means publishes
# beside the file deployed pages still read; the upload copies and never
# deletes. On the build box, not in run.sh: it downloads the 2.3 GB callset
# once.
#
# Usage: website/pangenome-config/buildHprcSvStates.sh
#   HPRC_SV_STATES_DIR  work dir (default /mnt/sdb/cdiesh/hprcSvStates)
#   JOBS                chromosomes at once (default 12)
#   RAW_JOBS            ranged readers of the raw callset at once (default 4)
#   PUBLISH=0           build and stop before the upload
set -euo pipefail
cd "$(dirname "$0")"
source ../../lib/common.sh

WORK="${HPRC_SV_STATES_DIR:-/mnt/sdb/cdiesh/hprcSvStates}"
JOBS="${JOBS:-12}"
RAW_JOBS="${RAW_JOBS:-4}"
FORMAT=v2
DEST=jbrowse-data:jbrowse.org/pangenome/hprc-grch38/sv-states
PACKER="$(pwd)/../generatePangenomeSvStates.ts"
RESTORER="$(pwd)/../restorePangenomeSvStates.ts"
# The wave callset the graph config's variant track names. The page's variants
# launch reads the pgbi callset instead, which has neither the INV nor the
# ORIGIN field this reads.
VCF=$(jq -r '.tracks[] | select(.type == "VariantTrack") | .adapter.uri' hprc-grch38.json | head -1)
RAW="${VCF%.wave.vcf.gz}.raw.vcf.gz"
NAME="$(basename "${VCF%.wave.vcf.gz}").sv-states.$FORMAT"
PARENTS="$WORK/parents/$(basename "$RAW")"

assert_bgzip_toolchain
mkdir -p "$WORK/rows" "$WORK/present" "$WORK/out" "$WORK/restored" "$PARENTS"
exec > >(tee -a "$WORK/build.log") 2>&1
log "Building $NAME in $WORK from $VCF"

# Cached under the callset's own name, so a config naming a new one fetches it
# rather than packing the old one again.
LOCAL_VCF="$WORK/$(basename "$VCF")"
for suffix in '' .tbi; do
  if [ ! -f "$LOCAL_VCF$suffix" ]; then
    curl -fsS -C - -o "$LOCAL_VCF$suffix.part" "$VCF$suffix"
    mv "$LOCAL_VCF$suffix.part" "$LOCAL_VCF$suffix"
  fi
done
RAW_INDEX="$PARENTS.tbi"
if [ ! -f "$RAW_INDEX" ]; then
  curl -fsS -o "$RAW_INDEX.part" "$RAW.tbi"
  mv "$RAW_INDEX.part" "$RAW_INDEX"
fi
bcftools query -l "$LOCAL_VCF" >"$WORK/samples.txt"
if ! bcftools query -l "$RAW##idx##$RAW_INDEX" | cmp -s - "$WORK/samples.txt"; then
  echo "the raw and wave callsets name different samples" >&2
  exit 1
fi
grep -v '^CHM13$' "$WORK/samples.txt" | sed 's/$/#1/;p;s/#1$/#2/' >"$WORK/haplotypes.txt"
tabix -l "$LOCAL_VCF" >"$WORK/chroms.txt"

pack_chrom() {
  set -euo pipefail
  local c=$1
  # A structural record: an allele at least 50 bp longer or shorter than the
  # reference is the tier the graph itself records.
  bcftools query -r "$c" -i 'STRLEN(REF)>=50 || STRLEN(ALT)>=50' \
    -f '%CHROM\t%POS\t%ID\t%INFO/LV\t%INFO/PS\t%INFO/INV\t%REF\t%ALT[\t%GT]\n' \
    "$LOCAL_VCF" |
    node "$PACKER" "$WORK/samples.txt" >"$WORK/rows/$c.tsv.part"
  mv "$WORK/rows/$c.tsv.part" "$WORK/rows/$c.tsv"
  # Which parent snarls the nested records name have a record of their own,
  # under that ID or as the origin of a vcfwave decomposition.
  awk -F'\t' '$5 != "0" {print $6}' "$WORK/rows/$c.tsv" | sort -u >"$WORK/present/$c.named"
  if [ -s "$WORK/present/$c.named" ]; then
    # grep exits 1 when no named parent is present, which is an answer; 2 is not.
    bcftools query -r "$c" -f '%ID\n%INFO/ORIGIN\n' "$LOCAL_VCF" |
      { grep -Fxf "$WORK/present/$c.named" || [ $? -eq 1 ]; } |
      sort -u >"$WORK/present/$c.txt"
  else
    : >"$WORK/present/$c.txt"
  fi
  # The present list is read in BEGIN rather than as a first file: it is empty
  # wherever no nested record's parent survived, and an empty first file makes
  # awk's NR == FNR true for the records themselves, which printed nothing.
  awk -F'\t' -v presentFile="$WORK/present/$c.txt" '
    BEGIN { while ((getline id < presentFile) > 0) { present[id] = 1 } }
    $5 == "0" || !($6 in present)' "$WORK/rows/$c.tsv" >"$WORK/rows/$c.kept.part"
  mv "$WORK/rows/$c.kept.part" "$WORK/rows/$c.kept"
  echo "  $c: $(wc -l <"$WORK/rows/$c.tsv") records, $(wc -l <"$WORK/present/$c.named") parents named, $(wc -l <"$WORK/present/$c.txt") of them present"
}

parent_file() {
  echo "$PARENTS/$(printf %s "$1" | md5sum | cut -c1-32).tsv"
}

# One removed parent, as its allele lengths: the record is 27 to 92 MB of
# sequence. A parent the raw callset lacks leaves an empty file.
fetch_parent() {
  set -euo pipefail
  local c=$1 from=$2 to=$3 id=$4 out
  out=$(parent_file "$id")
  if [ ! -f "$out" ]; then
    bcftools query -r "$c:$from-$to" -i "ID=\"$id\"" \
      -f '%CHROM\t%POS\t%ID\t%INFO/LV\t%INFO/PS\t%REF\t%ALT[\t%GT]\n' \
      "$RAW##idx##$RAW_INDEX" |
      awk -F'\t' -v OFS='\t' '{
        n = split($7, alt, ","); lengths = length(alt[1])
        for (i = 2; i <= n; i++) { lengths = lengths "," length(alt[i]) }
        $6 = length($6); $7 = lengths; print }' >"$out.part"
    mv "$out.part" "$out"
  fi
}

restore_chrom() {
  set -euo pipefail
  local c=$1
  node "$RESTORER" "$WORK/samples.txt" "$WORK/restored/parents.tsv" \
    <"$WORK/rows/$c.kept" 2>"$WORK/restored/$c.counts" |
    LC_ALL=C sort -k2,2n -k3,3n >"$WORK/restored/$c.tsv.part"
  mv "$WORK/restored/$c.tsv.part" "$WORK/restored/$c.tsv"
}
export -f pack_chrom parent_file fetch_parent restore_chrom
export WORK PACKER RESTORER LOCAL_VCF RAW RAW_INDEX PARENTS

xargs -P "$JOBS" -n 1 bash -c 'pack_chrom "$@"' _ <"$WORK/chroms.txt"

# Each removed parent the kept rows name, then the parents those name until
# none is new. The read spans every row naming the parent, not one: vcfwave
# moves a record, and 10 of the 425 parents do not reach their first child's
# new position.
: >"$WORK/restored/parents.tsv"
: >"$WORK/restored/asked.txt"
while read -r c; do
  awk -F'\t' -v OFS='\t' '
    $5 != "0" {
      chrom = $1
      if (!($6 in from)) { from[$6] = $2 + 1; to[$6] = $3; order[++n] = $6 }
      if ($2 + 1 < from[$6]) { from[$6] = $2 + 1 }
      if ($3 > to[$6]) { to[$6] = $3 }
    }
    END { for (i = 1; i <= n; i++) { print chrom, from[order[i]], to[order[i]], order[i] } }' \
    "$WORK/rows/$c.kept"
done <"$WORK/chroms.txt" >"$WORK/restored/wanted.tsv"
if [ ! -s "$WORK/restored/wanted.tsv" ]; then
  echo "no kept row names a removed parent; refusing to publish a sidecar without them" >&2
  exit 1
fi
while [ -s "$WORK/restored/wanted.tsv" ]; do
  cut -f4 "$WORK/restored/wanted.tsv" >>"$WORK/restored/asked.txt"
  xargs -P "$RAW_JOBS" -n 4 bash -c 'fetch_parent "$@"' _ <"$WORK/restored/wanted.tsv"
  while read -r _ _ _ id; do
    cat "$(parent_file "$id")"
  done <"$WORK/restored/wanted.tsv" >"$WORK/restored/round.tsv"
  log "$(wc -l <"$WORK/restored/round.tsv") of $(wc -l <"$WORK/restored/wanted.tsv") removed parents read from $RAW"
  cat "$WORK/restored/round.tsv" >>"$WORK/restored/parents.tsv"
  awk -F'\t' -v OFS='\t' -v askedFile="$WORK/restored/asked.txt" '
    BEGIN { while ((getline id < askedFile) > 0) { asked[id] = 1 } }
    $5 != "." && !($5 in asked) && !seen[$5]++ {print $1, $2, $2, $5}' \
    "$WORK/restored/round.tsv" >"$WORK/restored/wanted.tsv"
done
if [ ! -s "$WORK/restored/parents.tsv" ]; then
  echo "the raw callset returned none of $(wc -l <"$WORK/restored/asked.txt") removed parents" >&2
  exit 1
fi

xargs -P "$JOBS" -n 1 bash -c 'restore_chrom "$@"' _ <"$WORK/chroms.txt"

{
  printf '#haplotypes\t%s\n' "$(paste -sd, "$WORK/haplotypes.txt")"
  while read -r c; do
    cat "$WORK/restored/$c.tsv"
  done <"$WORK/chroms.txt"
} | bgzip -c >"$WORK/out/$NAME.tsv.gz.part"
mv "$WORK/out/$NAME.tsv.gz.part" "$WORK/out/$NAME.tsv.gz"
tabix -f -0 -s 1 -b 2 -e 3 -c '#' "$WORK/out/$NAME.tsv.gz"
log "$(gzip -dc "$WORK/out/$NAME.tsv.gz" | tail -n +2 | wc -l) records over $(wc -l <"$WORK/haplotypes.txt") haplotypes, $(stat -c %s "$WORK/out/$NAME.tsv.gz") bytes"
log "$(cat "$WORK"/restored/*.counts | awk '{r += $1; d += $2; p += $3; u += $4} END {
  print r " parents restored, " d " dropped under the carrier floor, " p " no calls placed under a parent (_), " u " not placed (.)"}')"

cat >"$WORK/out/$NAME.README.txt" <<EOF
HPRC release 2 structural states, one row per record, for JBrowse 2
==================================================================

A derivative of HPRC data, not original data. $NAME.tsv.gz holds every record of

  $VCF

with an allele at least 50 bp longer or shorter than the reference, as

  chrom  start(0-based)  end  id  states  genotypes

where genotypes is one character per haplotype, in the order the first line
names, and states says what each character does to the reference's structure:
0 its own structure, v inverted, and 1-9a-zA-Z a size change to two significant
figures (1:-1700 is a 1.7 kb deletion), ranked by how many haplotypes carry it.
A record nested under a parent snarl that is itself in the callset is dropped.

That callset lacks every snarl whose reference allele passes 100 kb, though it
keeps their children. Each such snarl is restored here as a row from

  $RAW

where a size change under 1 kb is the reference's structure, since the row sums
every small change its children report. A haplotype with no call at a record is
_ where a restored ancestor calls it, so that it takes another route through the
ancestor and the ancestor's row says what it carries, and . where none does:
the graph does not carry it through the site. CHM13 is left out.

The file beside this one without ".$FORMAT" in its name is the earlier format,
which has no restored rows and writes . for both.

HPRC data is released under CC0; see
https://github.com/human-pangenomics/hpp_pangenome_resources for the release
and its terms. Rebuilt by website/pangenome-config/buildHprcSvStates.sh in
https://github.com/GMOD/jb2hubs with $(bcftools --version | head -1),
$(bgzip --version | head -1) and node $(node --version).
EOF

if [ "${PUBLISH:-1}" = 0 ]; then
  log "PUBLISH=0: built $WORK/out/$NAME.tsv.gz, nothing uploaded"
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
data=$(publish --include "$NAME.tsv.gz" --include "$NAME.README.txt")
index=$(publish --include "$NAME.tsv.gz.tbi" --header-upload "Cache-Control: no-cache")
changed=$((data + index))
log "$changed object(s) changed under $DEST"
if [ "$changed" -gt 0 ]; then
  cloudfront_invalidate "/pangenome/hprc-grch38/sv-states/$NAME*"
fi
