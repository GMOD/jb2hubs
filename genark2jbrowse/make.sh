#!/bin/bash
#
# make.sh
#
# Main build script for genark2jbrowse.
#
# Usage:
#   ./make.sh                 # Process only new hubs (default, fastest)
#   ./make.sh --all           # Process all hubs
#   ./make.sh --reprocess-all # Re-download and reprocess everything
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

# Parse arguments. --all, --reprocess-all and --help are handled by parse_flags;
# this pipeline has no extra flags of its own.
PROCESS_ALL=false
EXPLAIN=false
USAGE="Usage: $0 [OPTIONS]

Every run also re-fetches the oldest slice of stale NCBI metadata, so upstream
changes trickle in without a full --reprocess-all.

Options:
  (default)        Process only new hubs (fastest)"
handle_flag() { return 1; }
parse_flags "$@"

# Refuse to derive anything with a bgzip that would emit different bytes than
# the corpus holds -- see assert_bgzip_toolchain in lib/common.sh. Checked before
# any derivation runs, because the damage is done by the time output exists.
assert_bgzip_toolchain

# "new" | "all" | "reprocess", for logging and for the phases that only skip
# work in the default incremental mode.
MODE="new"
if [ "$PROCESS_ALL" = true ]; then
  MODE="all"
fi
if [ -n "${REPROCESS:-}" ]; then
  MODE="reprocess"
fi

# "new" means "this accession has no hub.txt yet", so an existing hub's config is
# never regenerated -- and a converter change therefore reaches none of the
# 50,701 of them until someone remembers --reprocess-all. That is the same gap
# ucsc2jbrowse had, where it silently shipped stale configs after a fix (see the
# converter-stamp section in CLAUDE.md).
#
# One repo-level stamp rather than the per-assembly stamps ucsc2jbrowse uses:
# there the unit of work is ~240 directories, here it is 50,701, and a stamp
# beside each would be 50,701 files to answer a question that has one answer.
# So the stamp escalates the mode instead: changed code means every hub is
# stale, which is exactly what "all" already does.
#
# An absent stamp bootstraps rather than escalating, for the same reason the
# ucsc derivation stamp does: the code that built what is on disk is unknown,
# and assuming the worst would turn an unrelated first run into a full 50,701
# hub rebuild. From the next change onward it is caught.
PIPELINE_SOURCES=(lib hubtools/src genark2jbrowse/src)
for sh_file in "$SCRIPT_DIR"/*.sh; do
  PIPELINE_SOURCES+=("genark2jbrowse/$(basename "$sh_file")")
done
PIPELINE_HASH=$(source_tree_hash "$SCRIPT_DIR/.." "${PIPELINE_SOURCES[@]}")
PIPELINE_STAMP="$SCRIPT_DIR/.pipeline_hash"
stored_pipeline_hash=$(cat "$PIPELINE_STAMP" 2>/dev/null || echo "")

if [ "$MODE" = "new" ] && [ -n "$stored_pipeline_hash" ] &&
  [ "$stored_pipeline_hash" != "$PIPELINE_HASH" ]; then
  log "Converter sources changed since the last full build; processing all hubs rather than only new ones."
  MODE="all"
fi

# Records the code that built the current hub tree. Called on every successful
# exit, and deliberately refuses to write on an incremental run: "new" mode
# touched only new hubs, so claiming the other 50,700 are current would be a
# lie, and the next converter change would go undetected. The one exception is
# the bootstrap above -- an absent stamp has to start somewhere.
save_pipeline_stamp() {
  if [ "$MODE" != "new" ] || [ -z "$stored_pipeline_hash" ]; then
    printf '%s\n' "$PIPELINE_HASH" >"$PIPELINE_STAMP"
  fi
}

# --- --explain ---------------------------------------------------------------
#
# What a run would do and why, without doing it. Everything above this point is
# a local decision, and MODE is the whole answer here -- a genark run has one
# gate, not ucsc2jbrowse's two levels of them.
#
# What it deliberately cannot tell you is the new-hub count, which needs the hub
# list from hgdownload. In "new" mode that count decides whether phases 3-6 run
# at all, so the honest report says the count is unknown rather than implying a
# scope it has not measured.
explain_run() {
  local hub_count
  echo
  echo "=== genark2jbrowse --explain ====================================="
  echo
  echo "Local stamps only: no network, no writes, nothing built."
  echo
  # Reports MODE, not the flags: the stamp check above may already have
  # escalated it, and the escalation is the single most useful thing this can
  # say -- it is what turns an expected few-minute incremental run into all
  # 50,000+ hubs.
  echo "Mode: $MODE"
  case "$MODE" in
  reprocess)
    echo "  --reprocess-all: every hub is re-derived from cached downloads."
    echo "  The pipeline stamp is not consulted."
    ;;
  all)
    if [ "$PROCESS_ALL" = true ]; then
      echo "  --all: every hub is regenerated."
    else
      echo "  ESCALATED from \"new\" by the pipeline stamp below: the converter"
      echo "  moved, so every hub on disk is stale and all of them are"
      echo "  regenerated. This is the expensive outcome; it is not what a plain"
      echo "  ./make.sh usually does."
    fi
    ;;
  *)
    echo "  Only accessions with no hub.txt yet. The oldest slice of stale NCBI"
    echo "  metadata is refreshed and all.json regenerated either way."
    ;;
  esac

  echo
  echo "Code stamp"
  explain_stamp "pipeline hash" "$PIPELINE_HASH" "$PIPELINE_STAMP" \
    "escalates \"new\" to \"all\": every hub on disk was built by a different converter"

  hub_count=$(find "$SCRIPT_DIR/../hubs" -name config.json 2>/dev/null | grep -c . || true)
  echo
  echo "Scope"
  echo "  $hub_count hub configs on disk."
  if [ "$MODE" = "new" ]; then
    echo "  How many are NEW needs the hub list from hgdownload, which this does"
    echo "  not fetch -- so the size of this run is genuinely unknown until it"
    echo "  starts. If the count comes back 0, phases 3-6 are skipped entirely."
  else
    echo "  All of them are in scope for regeneration, plus any new accession"
    echo "  the hub list turns out to name."
  fi
  echo
}

if [ "$EXPLAIN" = true ]; then
  explain_run
  exit 0
fi

# Temp files for intermediate data (used in new-only mode)
NEW_HUBS_FILE=$(mktemp)
NEW_ACCESSIONS_FILE=$(mktemp)
NEW_HUB_COUNT=0

cleanup() {
  rm -f "$NEW_HUBS_FILE" "$NEW_ACCESSIONS_FILE" "${ALL_META_FILE:-}" 2>/dev/null || true
}
trap cleanup EXIT

log "Mode: $MODE"

# --- Phase 1: Download hub list and hub.txt files ---

log "Downloading list of hubs..."
node src/downloadHubList.ts

log "Downloading hub.txt files..."
if [ "$MODE" = "new" ]; then
  # Capture new hubs for incremental processing
  node src/downloadHubs.ts >"$NEW_HUBS_FILE"

  NEW_HUB_COUNT=$(wc -l <"$NEW_HUBS_FILE")
  if [ "$NEW_HUB_COUNT" -eq 0 ]; then
    # Don't exit: the stale-metadata refresh below still needs to run so NCBI
    # changes trickle in even on days with no new hubs.
    log "No new hubs found; will still refresh stale NCBI metadata."
  else
    log "Found $NEW_HUB_COUNT new hub(s) to process"
  fi

  # Extract accessions from new hubs
  sed 's|/meta\.json$||; s|.*/||' "$NEW_HUBS_FILE" >"$NEW_ACCESSIONS_FILE"
else
  # Download all (output goes to stderr, stdout has new hubs which we ignore)
  node src/downloadHubs.ts >/dev/null
fi

# --- Phase 2: Fetch metadata ---

# One unified path for every mode. buildNcbiQueue.ts decides what to fetch:
# assemblies with no ncbi.json yet (new hubs), plus a bounded, oldest-first slice
# of already-fetched ones whose metadata has aged out (see fetchNcbiMetadata.sh).
# This trickle keeps NCBI metadata fresh on ordinary incremental runs, so picking
# up upstream changes (status flips, re-annotation, new fields) no longer requires
# a full --reprocess-all.
log "Fetching NCBI metadata..."
./fetchNcbiMetadata.sh

log "Processing hub JSON data..."
node src/processHubJson.ts

log "Generating category index..."
node src/generateCategoriesJson.ts

# With no new hubs, the stale-metadata refresh and all.json regen above are the
# only work needed; everything below is per-hub generation for new hubs, so skip
# it (the same point the old "nothing to process" early-exit reached).
if [ "$MODE" = "new" ] && [ "$NEW_HUB_COUNT" -eq 0 ]; then
  log "No new hubs; refreshed stale metadata and regenerated all.json. Done."
  save_pipeline_stamp
  exit 0
fi

log "Processing UCSC list data..."
node src/processUcscList.ts

# Cache fd results for "all" mode to avoid repeated directory traversals
if [ "$MODE" != "new" ]; then
  ALL_META_FILE=$(mktemp)
  fd '^meta\.json$' hubs >"$ALL_META_FILE"
  log "Found $(wc -l <"$ALL_META_FILE") hub assemblies"
fi

# --- Phase 3: Per-hub data files (nothing here touches config.json) ---

log "Downloading NCBI GFF files..."
mkdir -p gff
if [ "$MODE" = "new" ]; then
  ./downloadNcbiGff.sh "$NEW_ACCESSIONS_FILE"
else
  ./downloadNcbiGff.sh
fi

log "Processing NCBI GFF files..."
mkdir -p bgz
if [ "$MODE" = "new" ]; then
  ./processGffFiles.sh "$NEW_ACCESSIONS_FILE"
else
  ./processGffFiles.sh
fi

log "Deriving genetic codes from NCBI GFF files..."
if [ "$MODE" = "new" ]; then
  ./deriveGeneticCodes.sh "$NEW_ACCESSIONS_FILE"
else
  ./deriveGeneticCodes.sh
fi

log "Processing liftOver chain files and creating PIFs..."
if [ "$MODE" = "new" ]; then
  run_parallel_reporting 'chain PIFs' './createChainTrackPifs.sh {}' <"$NEW_HUBS_FILE"
elif [ -n "${REPROCESS:-}" ]; then
  # Force regen (e.g. to add the coarse PIF tier): bypass the .checked gate and
  # let createChainTrackPifs.sh clear stamps / overwrite existing outputs.
  run_parallel_reporting 'chain PIFs' './createChainTrackPifs.sh {}' <"$ALL_META_FILE"
else
  # An `if` rather than a `&&`: the loop's exit status is its last iteration's,
  # so a `&&` whose test fails on the final hub would fail the pipeline under
  # pipefail. The old trailing `|| true` was covering that.
  while IFS= read -r meta; do
    if [[ ! -f "$(dirname "$meta")/liftOver/.checked" ]]; then
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
NEEDS_INDEX_FILE=$(mktemp)
if [ "$MODE" = "new" ]; then
  node src/buildConfigsBatch.ts <"$NEW_HUBS_FILE" >"$NEEDS_INDEX_FILE"
else
  node src/buildConfigsBatch.ts <"$ALL_META_FILE" >"$NEEDS_INDEX_FILE"
fi

log "Text indexing NCBI GFF tracks..."
./textIndex.sh <"$NEEDS_INDEX_FILE"
rm -f "$NEEDS_INDEX_FILE"

log "Calculating gff file hashes..."
./getFileListing.sh

# --- Phase 7: Mouse strain assemblies ---
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

# --- Done ---

save_pipeline_stamp

if [ "$MODE" = "new" ]; then
  log "Done processing $NEW_HUB_COUNT new hub(s)"
else
  log "Done processing all hubs"
fi
