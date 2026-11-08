# shellcheck shell=bash
# Sourced by the sidecar builds, after lib/common.sh: the steps they share,
# writing a sidecar and publishing what a build made, and for
# buildArabidopsisSvStates.sh and buildMouseSvStates.sh the turn of one
# `minigraph -cxasm --call` file per assembly into the VCF, and of the VCF into
# the sidecar rows `pangenomeSvStates.ts` reads. Each function logs what it
# counted with `log`.

MGUTILS="${MGUTILS_DIR:-$HOME/src/minigraph/misc}"
PACKER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/pangenome/build/generatePangenomeSvStates.ts"

# Writes the sidecar rows on stdin to <out.tsv.gz> and its .tbi, under a
# `#haplotypes` line naming <haplotypes.txt>'s haplotypes in the order the
# rows' genotypes follow.
write_sv_states() {
  local haplotypes="$1" out="$2"
  {
    printf '#haplotypes\t%s\n' "$(paste -sd, "$haplotypes")"
    cat
  } | bgzip -c >"$out.part"
  mv "$out.part" "$out"
  tabix -f -0 -s 1 -b 2 -e 3 -c '#' "$out"
  log "$(gzip -dc "$out" | tail -n +2 | wc -l) records over $(wc -l <"$haplotypes") haplotypes, $(stat -c %s "$out") bytes"
}

# Copies <dir>'s <name>.* to <dest>, an rclone remote under jbrowse.org/, and
# invalidates them where any changed, unless PUBLISH=0. A build copies and
# never syncs, so the file deployed pages read stays in place.
publish_built() {
  local dir="$1" dest="$2" name="$3" changed
  if [ "${PUBLISH:-1}" = 0 ]; then
    log "PUBLISH=0: built $dir/$name.*, nothing uploaded"
  else
    changed=$(rclone_copy_with_indexes "$dir" "$dest" "$name.*")
    log "$changed object(s) changed under $dest"
    if [ "$changed" -gt 0 ]; then
      cloudfront_invalidate "/${dest#*jbrowse.org/}/$name*"
    fi
  fi
}

# Prints the bubble count the call files share, and fails unless they share one.
call_file_bubbles() {
  local lines
  lines=$(for f in "$@"; do wc -l <"$f"; done | sort -u)
  if [ "$(wc -l <<<"$lines")" -ne 1 ] || [ "$lines" -eq 0 ]; then
    echo "the call files differ in line count ($(paste -sd, <<<"$lines")), so their bubbles do not line up" >&2
    return 1
  fi
  echo "$lines"
}

# Writes <vcf> from the call files, one per line of <samples.txt>, in its order.
# The first sample is the reference: merge2vcf -r0 reads its call as allele 0,
# a record whose reference call is not that allele is dropped, and so is its
# column. <contigs> lists the reference's sequences as `name length`, and
# <prefix> is the PanSN prefix the graph's sequence names carry.
minigraph_calls_to_vcf() {
  local vcf="$1" samples="$2" contigs="$3" prefix="$4"
  shift 4
  local work reference
  work=$(dirname "$vcf")
  reference=$(head -1 "$samples")
  awk '{ printf "##contig=<ID=%s,length=%d>\n", $1, $2 }' "$contigs" >"$work/header.txt"
  cat >>"$work/header.txt" <<'EOF'
##INFO=<ID=END,Number=1,Type=Integer,Description="End of the bubble">
##INFO=<ID=AN,Number=1,Type=Integer,Description="Number of called alleles">
EOF
  {
    cat "$work/header.txt"
    paste "$@" | k8 "$MGUTILS/mgutils.js" merge -s "$samples" - |
      sed "s/^$prefix//"
  } >"$work/merged.bed"
  k8 "$MGUTILS/mgutils-es6.js" merge2vcf -r0 -a "$#" "$work/merged.bed" |
    bcftools annotate --set-id '%INFO/VS%INFO/VE' -Ou |
    bcftools view -i 'GT[0]="ref"' -Ou |
    bcftools view -s "^$reference" -Ou |
    bcftools sort -Oz -o "$vcf.part"
  mv "$vcf.part" "$vcf"
  tabix -f -p vcf "$vcf"
  rm "$work/merged.bed"
}

# Packs every record of <vcf> with an allele at least 50 bp long into
# <out.tsv.gz> and its .tbi, the haplotypes named on its first line.
#
# Bubbles do not nest, so every record is kept and no parent is restored. A
# bubble whose span overlaps the one before starts at that one's end segment,
# so the two sit side by side in the graph; the log counts them.
pack_minigraph_sv_states() {
  local vcf="$1" out="$2" work
  work=$(dirname "$vcf")
  bcftools query -l "$vcf" >"$work/haplotypes.txt"
  bcftools query -i 'MAX(INFO/ALEN)>=50' \
    -f '%CHROM\t%POS\t%ID\t.\t.\t%INFO/AWALK\t%INFO/ALEN\t%ALT[\t%GT]\n' "$vcf" |
    node "$PACKER" --haploid --traversals --symbolic "$work/haplotypes.txt" |
    cut -f1-4,7,8 | LC_ALL=C sort -k1,1V -k2,2n -k3,3n >"$work/kept.tsv"
  if [ ! -s "$work/kept.tsv" ]; then
    echo "no structural record kept from $vcf" >&2
    return 1
  fi
  local overlaps
  overlaps=$(awk -F'\t' '
    { match($4, /^[<>][^<>]+/); source = substr($4, 2, RLENGTH - 1); sink = substr($4, RLENGTH + 2) }
    $1 == chrom && $2 < end { n++; if (source != prevSink) apart++ }
    $1 != chrom || $3 > end { end = $3 }
    { chrom = $1; prevSink = sink }
    END { printf "%d overlapping the one before, %d of them not at its end segment", n, apart }' "$work/kept.tsv")
  log "$(wc -l <"$work/kept.tsv") structural records kept, $overlaps"

  write_sv_states "$work/haplotypes.txt" "$out" <"$work/kept.tsv"
}
