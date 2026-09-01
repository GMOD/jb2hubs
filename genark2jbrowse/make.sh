#!/bin/bash
#
# make.sh
#
# Main build script for genark2jbrowse.
#
# Usage:
#   ./make.sh                 # Process every hub (only stale outputs are rebuilt)
#   ./make.sh --reprocess-all # Re-derive everything from cached downloads
#
# There is no "new hubs only" mode any more. Every phase below is gated per
# file -- a GFF is downloaded when absent, processed when newer than its
# output, chain files probed once per hub, a config written when its text
# changed -- so visiting all 52,000 hubs costs a couple of minutes on a warm
# tree, and a converter change reaches every config without a stamp deciding
# whether to escalate. The old mode needed a repo-level pipeline hash to catch
# exactly that case, and lost its work list when a run died.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

# Parse arguments. --all, --reprocess-all and --help are handled by parse_flags;
# --all is accepted for compatibility and changes nothing here (parse_flags sets
# PROCESS_ALL, which only ucsc2jbrowse reads).
EXPLAIN=false
USAGE="Usage: $0 [OPTIONS]

Every run visits every hub; each phase rebuilds only what is missing or stale.
The oldest slice of stale NCBI metadata is re-fetched as well, so upstream
changes trickle in without a full --reprocess-all.

Options:
  (default)        Rebuild whatever is stale"
handle_flag() { return 1; }
parse_flags "$@"

# Refuse to derive anything with a bgzip that would emit different bytes than
# the corpus holds -- see assert_bgzip_toolchain in lib/common.sh. Checked before
# any derivation runs, because the damage is done by the time output exists.
assert_bgzip_toolchain

if [ "$EXPLAIN" = true ]; then
  echo
  echo "=== genark2jbrowse --explain ====================================="
  echo
  echo "Every run visits every hub. Nothing here is decided by a stamp: each"
  echo "phase is gated per file, so what a run rebuilds is whatever is missing"
  echo "or older than its inputs, plus any new accession the hub list names."
  if [ -n "${REPROCESS:-}" ]; then
    echo "  --reprocess-all: every derived file and config is rebuilt from"
    echo "  cached downloads, and every text index and chain probe redone."
  fi
  echo "  $(find "$SCRIPT_DIR/../hubs" -name config.json 2>/dev/null | grep -c . || true) hub configs on disk."
  echo
  exit 0
fi

ALL_META_FILE=$(mktemp)
NEEDS_INDEX_FILE=$(mktemp)
UPSTREAM_HUB_LIST=$(mktemp)
STALE_HUB_TXT=$(mktemp)
trap 'rm -f "$ALL_META_FILE" "$NEEDS_INDEX_FILE" "$UPSTREAM_HUB_LIST" "$STALE_HUB_TXT"' EXIT

# --- Phase 1: Download hub list and hub.txt files ---

log "Downloading list of hubs..."
node src/downloadHubList.ts

# A hub.txt was fetched once and never again, so tracks, labels and liftOver
# chains UCSC adds to an existing hub never reached its config (measured
# 2026-09-01: about a quarter of the hub.txt files upstream had changed since
# we fetched them). Refreshed in three steps, one rsync connection each way:
# list every hub.txt upstream with its size and mtime (two rsync walks, about
# ten minutes), copy the ones that differ from the local file (rsync -t leaves
# upstream's mtime on the copy, so the next walk sees them as current), and
# re-probe the chain directory of any hub whose hub.txt content moved. A failed
# walk skips the refresh rather than guessing.
log "Listing upstream hub.txt files..."
if ./listUpstreamHubs.sh "$UPSTREAM_HUB_LIST"; then
  export UPSTREAM_HUB_LIST
  log "Refreshing hub.txt files that changed upstream..."
  node src/staleHubTxt.ts "$UPSTREAM_HUB_LIST" >"$STALE_HUB_TXT"
  if [ -s "$STALE_HUB_TXT" ]; then
    rsync -t --files-from="$STALE_HUB_TXT" rsync://hgdownload.soe.ucsc.edu/hubs/ hubs/
    git -C .. status --porcelain -- ':(glob)hubs/**/hub.txt' |
      awk '$1 == "M" { sub(/\/hub\.txt$/, "/liftOver/.checked", $2); print $2 }' |
      xargs -r rm -f
  fi
else
  log "Upstream listing failed; existing hub.txt files are not refreshed this run"
  unset UPSTREAM_HUB_LIST
fi

# Fetches hubs with no hub.txt yet, and reports hubs the assembly list names
# that the walk above did not find (their configs name files that 404).
log "Downloading hub.txt files..."
node src/downloadHubs.ts >/dev/null

# --- Phase 2: Fetch metadata ---

# buildNcbiQueue.ts decides what to fetch: assemblies with no ncbi.json yet,
# plus a bounded, oldest-first slice of already-fetched ones whose metadata has
# aged out (see fetchNcbiMetadata.sh). This trickle keeps NCBI metadata fresh
# on ordinary runs, so picking up upstream changes (status flips,
# re-annotation, new fields) does not need a full --reprocess-all.
log "Fetching NCBI metadata..."
./fetchNcbiMetadata.sh

log "Processing hub JSON data..."
node src/processHubJson.ts

log "Generating category index..."
node src/generateCategoriesJson.ts

log "Processing UCSC list data..."
node src/processUcscList.ts

fd '^meta\.json$' hubs >"$ALL_META_FILE"
log "Found $(wc -l <"$ALL_META_FILE") hub assemblies"

# --- Phase 3: Per-hub data files (nothing here touches config.json) ---

log "Downloading NCBI GFF files..."
mkdir -p gff
./downloadNcbiGff.sh

log "Processing NCBI GFF files..."
mkdir -p bgz
./processGffFiles.sh

log "Deriving genetic codes from NCBI GFF files..."
./deriveGeneticCodes.sh

# Each hub's liftOver directory is probed for chain files once, recorded by
# its .checked stamp; REPROCESS clears the stamps and regenerates every PIF
# (e.g. to add the coarse PIF tier).
log "Processing liftOver chain files and creating PIFs..."
if [ -n "${REPROCESS:-}" ]; then
  run_parallel_reporting 'chain PIFs' './createChainTrackPifs.sh {}' <"$ALL_META_FILE"
else
  # An `if` rather than a `&&`: the loop's exit status is its last iteration's,
  # so a `&&` whose test fails on the final hub would fail the pipeline under
  # pipefail.
  while IFS= read -r meta; do
    if [[ ! -f "${meta%/meta.json}/liftOver/.checked" ]]; then
      echo "$meta"
    fi
  done <"$ALL_META_FILE" | run_parallel_reporting 'chain PIFs' './createChainTrackPifs.sh {}'
fi

log "Fetching taxon-level images (Wikidata + Wikipedia)..."
node src/getTaxonImages.ts

log "Copying taxon images to accession directories..."
node src/copyTaxonImages.ts

# --- Phase 4: Build configs, one pass per hub ---
#
# src/buildConfigsBatch.ts assembles each config.json in memory from hub.txt,
# the GFF/codes/PIF files above and genArkExtensions/, enhances it, and writes
# it once, already in the tree's committed format. It used to be seven
# read-modify-write passes by five tools (generate, `jbrowse add-track`,
# `jbrowse text-index`, two jq splices, extensions, chain tracks, enhance), each
# leaving a half-built config on disk between them. The hub directories it
# prints are the ones whose text index is missing or older than the GFF.

log "Building configs..."
node src/buildConfigsBatch.ts <"$ALL_META_FILE" >"$NEEDS_INDEX_FILE"

log "Text indexing NCBI GFF tracks..."
./textIndex.sh <"$NEEDS_INDEX_FILE"

# --- Phase 5: Mouse strain assemblies ---
# Mouse strain hubs change very rarely; skip unless the stamp is older than 30 days.

MOUSE_STRAIN_STAMP=".mouse_strain_stamp"
MOUSE_STRAIN_MAX_AGE_DAYS=30
run_mouse_strains=true
age_days=0 # set by stamp_age_days below

if [ -z "${REPROCESS:-}" ] && stamp_age_days age_days "$MOUSE_STRAIN_STAMP" &&
  [ "$age_days" -lt "$MOUSE_STRAIN_MAX_AGE_DAYS" ]; then
  log "Skipping mouse strain processing (last run ${age_days} day(s) ago, threshold: ${MOUSE_STRAIN_MAX_AGE_DAYS} days)"
  run_mouse_strains=false
fi

if [ "$run_mouse_strains" = true ]; then
  log "Processing UCSC mouse strain assemblies..."
  node src/processMouseStrainsHub.ts

  log "Adding mm10 synteny tracks to mouse strain configs..."
  node src/createMouseStrainsChainTracks.ts

  log "Generating Ensembl mouse strains portal..."
  node src/processEnsemblMouseStrainsPortal.ts

  log "Adding mm39 synteny/MAF/VCF tracks to Ensembl mouse strain configs..."
  node src/createEnsemblMouseChainTracks.ts

  touch "$MOUSE_STRAIN_STAMP"
fi

log "Done processing all hubs"
