#!/bin/bash
#
# xenoSymbolIndex.sh
#
# Gene-symbol search for GCA hubs, which get no NCBI GFF and so no text index:
# joins each hub's xenoRefGene bigBed to NCBI's RefSeq accession -> symbol
# table and writes trix/<accession>.ix beside its config. Reads meta.json paths
# on stdin; src/buildXenoSymbolIndexes.ts does the per-hub work and gating.
#
# The symbol table is cut from gene2refseq.gz (2.4 GB, ~8 min) into
# refseqSymbols/refseqSymbols.tsv.gz (~3 MB) when it is missing or older than
# SYMBOLS_MAX_AGE_DAYS, or on FETCH_UPDATES. A refreshed table does not rebuild
# existing indexes; --reprocess-all does.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

GENE2REFSEQ_URL=https://ftp.ncbi.nlm.nih.gov/gene/DATA/gene2refseq.gz
SYMBOLS="$SCRIPT_DIR/refseqSymbols/refseqSymbols.tsv.gz"
SYMBOLS_MAX_AGE_DAYS=30
# 553,362 NM_/NR_ accessions on 2026-09-24; far fewer is a truncated stream.
SYMBOLS_MIN_ROWS=400000

# gene2refseq rows on stdin to "accession<TAB>symbol", the RNA accession
# unversioned and the first row for it winning. Only NM_/NR_: xenoRefGene is
# curated RefSeq mRNAs, never XM_.
cut_refseq_symbols() {
  grep -E $'\tN[MR]_' | awk -F'\t' '$4 ~ /^N[MR]_/ {
    split($4, a, ".")
    if (!(a[1] in seen)) { seen[a[1]] = 1; print a[1] "\t" $16 }
  }'
}

symbols_current() {
  local age
  [ -z "${FETCH_UPDATES:-}" ] && stamp_age_days age "$SYMBOLS" &&
    [ "$age" -lt "$SYMBOLS_MAX_AGE_DAYS" ]
}

fetch_refseq_symbols() {
  local tmp="$SYMBOLS.tmp" rows
  mkdir -p "$(dirname "$SYMBOLS")"
  if ! curl -fsS "$GENE2REFSEQ_URL" | pigz -dc | cut_refseq_symbols | pigz -9 >"$tmp"; then
    rm -f "$tmp"
    echo "xenoSymbolIndex: fetching $GENE2REFSEQ_URL failed" >&2
    return 1
  fi
  rows=$(pigz -dc "$tmp" | wc -l)
  if [ "$rows" -lt "$SYMBOLS_MIN_ROWS" ]; then
    rm -f "$tmp"
    echo "xenoSymbolIndex: gene2refseq cut to only $rows accessions; refusing it" >&2
    return 1
  fi
  mv "$tmp" "$SYMBOLS"
  echo "xenoSymbolIndex: $rows RefSeq accessions with a symbol"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  if ! symbols_current; then
    echo "Cutting RefSeq symbols from gene2refseq.gz..."
    if ! fetch_refseq_symbols && [ ! -f "$SYMBOLS" ]; then
      echo "xenoSymbolIndex: no symbol table; skipping this run" >&2
      exit 0
    fi
  fi
  cd "$SCRIPT_DIR"
  node src/buildXenoSymbolIndexes.ts "$SYMBOLS"
fi
