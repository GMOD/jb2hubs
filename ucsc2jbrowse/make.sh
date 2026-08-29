#!/bin/bash
#
# make.sh
#
# Main build script for ucsc2jbrowse.
#
# Usage:
#   ./make.sh                  # Download + process changed assemblies (default)
#   ./make.sh --all            # Process every assembly, not just changed ones
#   ./make.sh --skip-download  # Skip the rsync, just process (implies --all)
#   ./make.sh --reprocess-all  # Force reprocess everything from cached downloads
#
# --reprocess-all re-derives every config from already-downloaded data; it does
# not re-pull NCBI RefSeq GFFs (set FETCH_UPDATES=1 for that). The UCSC rsync it
# still runs is incremental, so an already-synced tree transfers almost nothing.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

# Parse arguments. --all, --reprocess-all and --help are handled by parse_flags.
SKIP_DOWNLOAD=false
PROCESS_ALL=false
EXPLAIN=false
USAGE="Usage: $0 [OPTIONS]

Options:
  (default)        Download, then process assemblies whose trackDb changed
  --skip-download  Skip the UCSC rsync and process what is already on disk
                   (implies --all, since there are no fresh hashes to compare)"
handle_flag() {
  case "$1" in
  --skip-download)
    SKIP_DOWNLOAD=true
    PROCESS_ALL=true
    ;;
  *) return 1 ;;
  esac
}
parse_flags "$@"

# --- Configuration ---

export CHECK_404=true
export TMPDIR="${TMPDIR:-/mnt/sdb/cdiesh/tmp}"

# Ensure the script's path is in the PATH for tool access.
export PATH="$SCRIPT_DIR:$PATH"

# How often each assembly is re-synced from hgdownload. Up here rather than
# inside the download loop because --explain reports on the same gate, and a
# second copy of the policy could describe a run this script would not do.
FREQUENT_ASSEMBLIES="hg19 hg38 mm39 rn6"
RSYNC_MONTHLY_DAYS=30

# The non-hub assemblies named by the cached UCSC genome list -- exactly the set
# the download loop rsyncs. Hub-backed entries (hs1, mpxvRivers, every
# GenArk-backed alias) are built from hub.txt in Phase 3 and never rsynced, so a
# preview that walked the downloads directory instead would claim sync work this
# script does not do. One selector, two callers.
list_rsync_assemblies() {
  jq -r '.ucscGenomes | to_entries[] | select(.value.nibPath | (. != null and startswith("hub:") | not)) | .key' \
    "$UCSC_BUILT_DIR/list.json.raw"
}

# Whether a run would rsync this assembly: always under REPROCESS, always for
# the frequently updated ones, otherwise only when the sync stamp is missing or
# older than the monthly threshold.
# Usage: if would_rsync hg38; then ...; fi
would_rsync() {
  local assembly="$1" age
  if [ -n "${REPROCESS:-}" ]; then
    return 0
  fi
  if echo "$FREQUENT_ASSEMBLIES" | grep -qw "$assembly"; then
    return 0
  fi
  if stamp_age_days age "$UCSC_DOWNLOADS_DIR/$assembly/.sync_stamp" &&
    [ "$age" -lt "$RSYNC_MONTHLY_DAYS" ]; then
    return 1
  fi
  return 0
}

# Refuse to derive anything with a bgzip that would emit different bytes than
# the corpus holds -- see assert_bgzip_toolchain in lib/common.sh. Checked before
# any derivation runs, because the damage is done by the time output exists.
assert_bgzip_toolchain

# A built config is a function of two things: the trackDb it was built from, and
# the converter that built it. Only the first used to be stamped, so an
# incremental run after a converter fix reported "No UCSC assemblies have
# changed" and shipped the old configs -- silently, since that line reads like
# success. That is what happened to hg19's mappability tracks on 2026-08-06:
# 24cbca057b6 exempted them from the wgEncode drop rule, ./run.sh was re-run,
# and nothing regenerated because getTrackModifications runs inside addMetadata,
# which only visits assemblies the trackDb stamp marked changed.
#
# The path list is deliberately broad -- every shell script, every src/*.ts, the
# extension/rename data, lib/ and hubtools/src -- because the two error
# directions are not symmetric. Over-invalidating costs one reprocess of cached
# inputs (a few minutes; the per-file derivations are needs_rebuild-gated and
# only the configs are actually re-derived). Under-invalidating ships wrong
# configs indefinitely, and nothing downstream can tell. Add new inputs here
# rather than trying to work out whether they matter.
PIPELINE_SOURCES=(lib hubtools/src bed2gff/src ucsc2jbrowse/src ucsc2jbrowse/ucscExtensions ucsc2jbrowse/ucscRenames)
for sh_file in "$SCRIPT_DIR"/*.sh; do
  PIPELINE_SOURCES+=("ucsc2jbrowse/$(basename "$sh_file")")
done
PIPELINE_HASH=$(source_tree_hash "$SCRIPT_DIR/.." "${PIPELINE_SOURCES[@]}")

# The same question one level down. PIPELINE_HASH decides which assemblies get
# reprocessed; this decides whether the per-file derivations inside that
# reprocess actually re-run, because needs_rebuild stamps only the source table
# and so cannot see a change to the code that converts it.
#
# That gap was not hypothetical: when encodeGffAttribute started percent-encoding
# control characters, dm6's and droPer1's ncbiRefSeq.gff.gz kept their raw
# carriage returns through a full reprocess -- their golden-path tables had not
# moved, so needs_rebuild skipped them -- and both had to be cleared by hand.
#
# This list MUST stay a subset of PIPELINE_SOURCES above. The guarantee it buys:
# a change here also changes PIPELINE_HASH, which marks every assembly changed,
# which is what puts the derivation scripts in front of every file. Drop that
# containment and REDERIVE would fire on a run that visits only some assemblies,
# and the stamp written at the end would claim the rest were re-derived too.
DERIVATION_SOURCES=(
  lib/common.sh
  bed2gff/src
  ucsc2jbrowse/src/utils
  ucsc2jbrowse/src/bedLike.ts
  ucsc2jbrowse/src/rmskLike.ts
  ucsc2jbrowse/src/geneLike.ts
  ucsc2jbrowse/src/fixupIsoforms.ts
  ucsc2jbrowse/src/enhanceGffWithLinkTable.ts
  ucsc2jbrowse/createBedTracksForGoldenPath.sh
  ucsc2jbrowse/createRmskTracksForGoldenPath.sh
  ucsc2jbrowse/createGeneTracksForGoldenPath.sh
)
DERIVATION_HASH=$(source_tree_hash "$SCRIPT_DIR/.." "${DERIVATION_SOURCES[@]}")
DERIVATION_STAMP="$UCSC_BUILT_DIR/.derivation_hash"

# Which assemblies need to go through the full processing pipeline, and why.
#
# Fills CHANGED_DL_DIRS / CHANGED_BUILT_DIRS with the work list, CHANGE_REASONS
# with one tab-separated "<name> <category> <detail>" row per entry, and
# stale_code_count with how many are being reprocessed for the surprising reason
# (the converter moved, not the data). The category is separate from the detail
# so --explain can group 200 identical answers into one line instead of printing
# them 200 times, which is the difference between a report and a wall.
#
# It reads stamps and hashes trackDb; it writes nothing. That is what lets
# --explain call the same function the run calls, instead of a second
# implementation of the gate that could describe a different run than the one
# that follows.
detect_changed_assemblies() {
  CHANGED_DL_DIRS=()
  CHANGED_BUILT_DIRS=()
  CHANGE_REASONS=()
  stale_code_count=0

  local assembly assembly_data_dir db_dir trackdb built_dir hash_file
  local pipeline_hash_file current_hash stored_hash stored_pipeline_hash
  local category detail

  if [ "$PROCESS_ALL" = true ]; then
    while IFS= read -r assembly_data_dir; do
      assembly=$(basename "$assembly_data_dir")
      CHANGED_DL_DIRS+=("$assembly_data_dir")
      CHANGED_BUILT_DIRS+=("$UCSC_BUILT_DIR/$assembly")
      CHANGE_REASONS+=("$assembly"$'\t'"forced"$'\t'"")
    done < <(list_assembly_dirs)
    return 0
  fi

  while IFS= read -r assembly_data_dir; do
    assembly=$(basename "$assembly_data_dir")
    db_dir="$assembly_data_dir/$assembly/database"
    trackdb="$db_dir/trackDb.txt.gz"
    built_dir="$UCSC_BUILT_DIR/$assembly"
    hash_file="$built_dir/.trackdb_hash"
    pipeline_hash_file="$built_dir/.pipeline_hash"

    if [ ! -f "$trackdb" ]; then
      continue
    fi

    # stderr is dropped: xxhsum writes a progress indicator per file, which over
    # 200+ assemblies buries every line this loop and --explain print. A genuine
    # failure still leaves current_hash empty, which reads as "changed" and
    # reprocesses -- the safe direction, and the file is read again downstream
    # where a real problem surfaces with context.
    current_hash=$(xxhsum -H3 "$trackdb" 2>/dev/null | awk '{print $NF}')
    stored_hash=$(cat "$hash_file" 2>/dev/null || echo "")
    stored_pipeline_hash=$(cat "$pipeline_hash_file" 2>/dev/null || echo "")

    if [ "$current_hash" = "$stored_hash" ] &&
      [ "$PIPELINE_HASH" = "$stored_pipeline_hash" ] &&
      [ -f "$built_dir/config.json" ]; then
      continue # unchanged
    fi

    if [ ! -f "$built_dir/config.json" ]; then
      category="never-built"
      detail=""
    elif [ "$current_hash" = "$stored_hash" ]; then
      # The surprising one, and the reason PIPELINE_HASH exists: no new data,
      # but the code that built the config on disk is not the code in the tree.
      category="converter-changed"
      detail=""
      stale_code_count=$((stale_code_count + 1))
    else
      category="trackdb-changed"
      detail="${stored_hash:-none} -> $current_hash"
    fi

    CHANGED_DL_DIRS+=("$assembly_data_dir")
    CHANGED_BUILT_DIRS+=("$built_dir")
    CHANGE_REASONS+=("$assembly"$'\t'"$category"$'\t'"$detail")
  done < <(list_assembly_dirs)
}

# --- --explain ---------------------------------------------------------------
#
# The question `make -n` answers and a shell pipeline does not: what would this
# run do, and why. Every gate involved is already a pure predicate over local
# stamps, so this is a report over the functions the run itself calls rather
# than a model of them -- which matters, because a model that drifted would be
# most confident exactly when it was wrong.
#
# It fetches nothing, and that bounds what it can honestly claim. A real run
# rsyncs from hgdownload first, so the DATA half of every answer is as of the
# last sync; the CODE half is exact. The report says so rather than implying a
# precision it does not have.
# Renders CHANGE_REASONS grouped by category. A converter change marks every
# assembly stale for the same reason, so the ungrouped form is 200+ identical
# lines with the two that actually got new data buried somewhere among them --
# the report would reproduce the problem it exists to solve. Ordered
# most-informative first for the same reason: new upstream data is news, and
# "the code changed" is one fact about the run, not 200 facts about assemblies.
EXPLAIN_NAME_SAMPLE=8
explain_reason_groups() {
  local row name category detail cat
  local -A names=() counts=()
  for row in "${CHANGE_REASONS[@]}"; do
    name=${row%%$'\t'*}
    detail=${row##*$'\t'}
    category=${row#*$'\t'}
    category=${category%%$'\t'*}
    counts[$category]=$((${counts[$category]:-0} + 1))
    if [ "${counts[$category]}" -le "$EXPLAIN_NAME_SAMPLE" ]; then
      if [ -n "$detail" ]; then
        names[$category]+=" $name ($detail)"
      else
        names[$category]+=" $name"
      fi
    fi
  done

  for cat in trackdb-changed never-built converter-changed forced; do
    if [ -n "${counts[$cat]:-}" ]; then
      case "$cat" in
      trackdb-changed) printf '    %-4s %s\n' "${counts[$cat]}" "trackDb changed upstream" ;;
      never-built) printf '    %-4s %s\n' "${counts[$cat]}" "never built (no config.json)" ;;
      converter-changed) printf '    %-4s %s\n' "${counts[$cat]}" "converter changed (trackDb unchanged)" ;;
      forced) printf '    %-4s %s\n' "${counts[$cat]}" "forced by --all" ;;
      esac
      printf '        %s' "${names[$cat]# }"
      if [ "${counts[$cat]}" -gt "$EXPLAIN_NAME_SAMPLE" ]; then
        printf ' ... and %s more' "$((counts[$cat] - EXPLAIN_NAME_SAMPLE))"
      fi
      printf '\n'
    fi
  done
}

explain_run() {
  local total=0 name reason count age
  echo
  echo "=== ucsc2jbrowse --explain ======================================="
  echo
  echo "Local stamps only: no network, no writes, nothing built. A real run"
  echo "rsyncs from hgdownload first, so a table that moved upstream since the"
  echo "last sync still reads as unchanged below. The code stamps are exact."
  echo
  echo "  built tree    $UCSC_BUILT_DIR"
  echo "  downloads     $UCSC_DOWNLOADS_DIR"

  if [ ! -d "$UCSC_DOWNLOADS_DIR" ]; then
    echo
    echo "No downloads directory, so there is nothing to compare against: a run"
    echo "would sync and build every assembly in the UCSC genome list."
    return 0
  fi

  echo
  echo "Code stamps"
  printf '  %-18s %s (compared against each assembly'"'"'s .pipeline_hash, below)\n' \
    "pipeline hash:" "$PIPELINE_HASH"
  explain_stamp "derivation hash" "$DERIVATION_HASH" "$DERIVATION_STAMP" \
    "REDERIVE=1: every bed/gff/rmsk output is rebuilt, not only those whose golden-path table moved"

  detect_changed_assemblies
  total=$(list_assembly_dirs | grep -c . || true)

  echo
  echo "Assemblies ($total on disk)"
  if [ "${#CHANGED_DL_DIRS[@]}" -eq 0 ]; then
    echo "  none would be reprocessed."
  else
    echo "  ${#CHANGED_DL_DIRS[@]} would be reprocessed:"
    explain_reason_groups
    echo "  $((total - ${#CHANGED_DL_DIRS[@]})) unchanged, skipped."
  fi

  # The rsync gate is the other reason a run "sees no changes": the table it
  # would have noticed was never pulled. would_rsync is the same predicate the
  # download loop applies.
  echo
  echo "Downloads (a real run does this FIRST, and it can change the answers above)"
  if [ "$SKIP_DOWNLOAD" = true ]; then
    echo "  skipped entirely (--skip-download)"
  elif [ ! -f "$UCSC_BUILT_DIR/list.json.raw" ]; then
    # The list is fetched at the top of a real run, so previewing the sync set
    # without one would mean guessing at it. Say so instead.
    echo "  no cached genome list yet, so the sync set cannot be previewed;"
    echo "  a run fetches it first and would sync every non-hub assembly in it."
  else
    local sync=0 skip=0 sync_names=() skip_ages=()
    while IFS= read -r name; do
      if ! is_assembly_db "$name"; then
        continue
      fi
      if would_rsync "$name"; then
        sync=$((sync + 1))
        if [ "$sync" -le "$EXPLAIN_NAME_SAMPLE" ]; then
          sync_names+=("$name")
        fi
      else
        skip=$((skip + 1))
        if stamp_age_days age "$UCSC_DOWNLOADS_DIR/$name/.sync_stamp"; then
          skip_ages+=("$age $name")
        fi
      fi
    done < <(list_rsync_assemblies)

    echo "  $sync would sync ($FREQUENT_ASSEMBLIES always, plus anything past ${RSYNC_MONTHLY_DAYS}d)"
    if [ "$sync" -gt 0 ]; then
      printf '        %s' "${sync_names[*]}"
      if [ "$sync" -gt "$EXPLAIN_NAME_SAMPLE" ]; then
        printf ' ... and %s more' "$((sync - EXPLAIN_NAME_SAMPLE))"
      fi
      printf '\n'
    fi

    # The oldest few rather than all 200: the question this answers is "could a
    # table have moved upstream without this run seeing it", and the assemblies
    # nearest the threshold are the only ones where the answer is interesting.
    echo "  $skip synced within ${RSYNC_MONTHLY_DAYS}d, skipped"
    if [ "${#skip_ages[@]}" -gt 0 ]; then
      printf '        oldest:'
      printf '%s\n' "${skip_ages[@]}" | sort -rn | head -5 |
        while read -r age name; do printf ' %s(%sd)' "$name" "$age"; done
      printf '\n'
    fi
  fi

  # Without this section "0 assemblies changed" reads as "0 work", which is what
  # made the hg19 mappability regression cost a day: the run after the fix
  # logged that line, did all of the below, and shipped the old configs anyway.
  echo
  echo "Runs regardless of everything above"
  echo "  hub configs, extension tracks, NCBI RefSeq GFFs, chain PIFs, hs1 PIFs,"
  echo "  GENCODE, finalizeConfigs (all $total), mergeAll, the configs/ copy and"
  echo "  prune, the staging siblings, and the file listing."
  echo
  echo "So a clean report here means nothing is REBUILT -- not that nothing runs."
  echo
}

# --- Phase 1: Download ---

# An absent stamp bootstraps rather than re-deriving. We cannot know which
# version of the converter produced the outputs already on disk, and assuming
# the worst would spend hours re-deriving every bed/gff/rmsk file on an
# unrelated run -- disproportionate to a gap that, from the next change onward,
# is closed. Recording the current hash makes every later change detectable,
# which is the property that was missing.
stored_derivation_hash=$(cat "$DERIVATION_STAMP" 2>/dev/null || echo "")
if [ -n "$stored_derivation_hash" ] && [ "$stored_derivation_hash" != "$DERIVATION_HASH" ]; then
  log "Derivation sources changed; re-deriving per-file track outputs (bed/gff/rmsk) even where the golden-path table is unchanged."
  export REDERIVE=1
fi

# Placed here because REDERIVE is the last decision made before work starts, and
# above ensure_dir because a report must not create the tree it reports on.
if [ "$EXPLAIN" = true ]; then
  explain_run
  exit 0
fi

ensure_dir "$UCSC_BUILT_DIR"

if [ "$SKIP_DOWNLOAD" = false ]; then
  log "Starting UCSC data download."

  log "Fetching latest UCSC genome list..."
  curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_BUILT_DIR/list.json.raw"

  age_days=0 # set by stamp_age_days below

  log "Downloading non-hub assemblies..."
  list_rsync_assemblies | while read -r assembly; do
    if ! is_assembly_db "$assembly"; then
      log "Skipping $assembly genome."
      continue
    fi

    sync_stamp="$UCSC_DOWNLOADS_DIR/$assembly/.sync_stamp"

    if ! would_rsync "$assembly"; then
      stamp_age_days age_days "$sync_stamp" || age_days="?"
      log "Skipping rsync for $assembly (synced ${age_days}d ago)"
      continue
    fi

    log "Syncing $assembly data..."
    ensure_dir "$UCSC_DOWNLOADS_DIR/$assembly/$assembly"
    rsync --max-size=2G -qavzP rsync://hgdownload.cse.ucsc.edu/goldenPath/"$assembly"/database "$UCSC_DOWNLOADS_DIR/$assembly/$assembly/"
    touch "$sync_stamp"
  done

  log "Downloading hgFixed assembly..."
  ensure_dir "$UCSC_DOWNLOADS_DIR/hgFixed/hgFixed"
  rsync --max-size=2G -azP rsync://hgdownload.cse.ucsc.edu/goldenPath/hgFixed/database "$UCSC_DOWNLOADS_DIR/hgFixed/hgFixed/"

  log "Download finished successfully!"
else
  log "Skipping download (--skip-download specified)"
fi

# --- Phase 1b: Detect changed assemblies ---
#
# For each assembly, compare the content hash of trackDb.txt.gz and the hash of
# the converter sources (PIPELINE_HASH above) against the stamps recorded when
# the assembly was last built. Assemblies where either differs (or that have no
# config.json yet) are "changed" and need to go through the full processing
# pipeline. Unchanged assemblies keep their existing built outputs from the
# previous run.
#
# Skip change detection when --all (or anything implying it) is active so those
# modes process everything.

detect_changed_assemblies

if [ "$PROCESS_ALL" = true ]; then
  log "Processing all ${#CHANGED_DL_DIRS[@]} assemblies (--all)..."
elif [ "${#CHANGED_DL_DIRS[@]}" -eq 0 ]; then
  log "No UCSC assemblies have changed. (Phase 3 onward still runs -- ./make.sh --explain lists what.)"
else
  changed_names=()
  for d in "${CHANGED_DL_DIRS[@]}"; do changed_names+=("$(basename "$d")"); done
  log "${#CHANGED_DL_DIRS[@]} changed assembly/assemblies: ${changed_names[*]}"
  # Called out separately because it is the surprising reason to see a large
  # rebuild on a run that pulled no new data: the converter changed, so every
  # config built by the old one is stale regardless of its trackDb.
  if [ "$stale_code_count" -gt 0 ]; then
    log "$stale_code_count of those have an unchanged trackDb and are being reprocessed because the converter sources changed."
  fi
fi

# --- Phase 2: Process ---

log "Starting the UCSC to JBrowse data processing pipeline."

ensure_dir "configs"

# Clear the merged reports (regenerated below). The fileAccessCache/ directory
# itself is kept: it holds the per-URL lastChecked stamps that suppress
# re-probing hgdownload for 90 days.
rm -f blockedFiles.txt blockedFiles.json removedTracks.json

# The download phase already wrote list.json.raw; fetch it here only if we
# skipped that phase.
if [ "$SKIP_DOWNLOAD" = true ]; then
  log "Fetching latest UCSC genome list..."
  curl -s https://api.genome.ucsc.edu/list/ucscGenomes >"$UCSC_BUILT_DIR/list.json.raw"
fi

# Keeps the ucscGenomes object shape (later phases and
# generateJBrowseConfigForAssemblyHub.sh both jq '.ucscGenomes | to_entries[]'
# over it), adding per-genome fields the website needs.
log "Enriching genome list..."
node src/transformGenomeList.ts "$UCSC_BUILT_DIR/list.json.raw" "$UCSC_BUILT_DIR/list.json"

log "Creating a copy for the website..."
cp "$UCSC_BUILT_DIR/list.json" "$SCRIPT_DIR/../website/src/list.json"

if [ "${#CHANGED_DL_DIRS[@]}" -gt 0 ]; then
  log "Creating initial assembly configurations for ${#CHANGED_DL_DIRS[@]} changed assemblies..."
  ./createAssemblies.sh "${CHANGED_DL_DIRS[@]}"

  log "Extracting track definitions from trackDb..."
  ./createTracksJsonForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Creating BED tracks..."
  ./createBedTracksForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Creating RepeatMasker tracks..."
  ./createRmskTracksForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Creating gene tracks..."
  ./createGeneTracksForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Generating JBrowse track configurations..."
  ./createConfigsForGoldenPath.sh "${CHANGED_DL_DIRS[@]}"

  log "Performing text indexing for search..."
  ./textIndexGoldenPath.sh "${CHANGED_BUILT_DIRS[@]}"
else
  log "Skipping per-assembly processing (no changes detected)"
fi

# --- Phase 3: Global processing (always runs) ---
# These steps handle hub assemblies, extension tracks, and cross-assembly concerns.
# They must run before the post-processing steps below, and must see the full built dir.

log "Creating configurations from track hubs..."
./generateJBrowseConfigForAssemblyHub.sh

log "Adding non-UCSC 'extension' tracks..."
node src/makeUcscExtensions.ts "$UCSC_BUILT_DIR"

log "Downloading and processing NCBI RefSeq GFFs..."
./downloadNcbiGff.sh

log "Creating chain track PIFs..."
./makePifs.sh

log "Making hs1 PIFs"
./processHs1LiftOver.sh

# --- Phase 4: Post-processing (changed assemblies + hub assemblies) ---
# These steps refine configs that were created or updated in phases 2-3.
# The ordering here matches the original pipeline: metadata → rename → enhance → gencode.
# Hub assemblies (hs1, etc.) are always included since they're rebuilt in phase 3.

# Build the list of dirs that need post-processing
POST_PROCESS_DIRS=("${CHANGED_BUILT_DIRS[@]}")

# Always include hub assemblies (rebuilt by generateJBrowseConfigForAssemblyHub)
while IFS= read -r hub_assembly; do
  hub_dir="$UCSC_BUILT_DIR/$hub_assembly"
  if [ -d "$hub_dir" ]; then
    POST_PROCESS_DIRS+=("$hub_dir")
  fi
done < <(jq -r '.ucscGenomes | to_entries[] | select(.value.nibPath | (. != null and startswith("hub:"))) | .key' "$UCSC_BUILT_DIR/list.json" 2>/dev/null)

if [ "${#POST_PROCESS_DIRS[@]}" -gt 0 ]; then
  log "Adding metadata to tracks..."
  ./addMetadata.sh "${POST_PROCESS_DIRS[@]}"

  log "Adding original assembly to track name..."
  ./addOrigAssemblyToAllTrackNames.sh "${POST_PROCESS_DIRS[@]}"

  log "Renaming some tracks..."
  node src/rewriteUcscTrackNames.ts "$UCSC_BUILT_DIR"

  log "Enhancing configs with plugins and hierarchical configuration..."
  ./enhanceConfigs.sh "${POST_PROCESS_DIRS[@]}"

  log "Adding mitochondrial genetic codes..."
  gc_configs=()
  for d in "${POST_PROCESS_DIRS[@]}"; do
    if [ -f "$d/config.json" ]; then
      gc_configs+=("$d/config.json")
    fi
  done
  if [ "${#gc_configs[@]}" -gt 0 ]; then
    node src/addGeneticCodes.ts "${gc_configs[@]}" || true
  fi
fi

log "Download and add GENCODE tracks"
./downloadGencode.sh

# One walk over every built assembly, applying the six finalize steps in the
# order src/finalizeConfigs.ts declares: refNameAliases/cytobands backfill,
# sidecar mirroring, UCSC db-name aliases, text search adapters, default
# sessions, minimal configs. Two of those adjacencies are load-bearing and the
# reasons are recorded beside the array, not here.
log "Finalizing configs..."
node src/finalizeConfigs.ts "$UCSC_BUILT_DIR" "$UCSC_DOWNLOADS_DIR"

# Only names the current UCSC genome list recognizes, plus hgFixed, which is
# rsynced deliberately and never appears in that list. UCSC_BUILT_DIR is not
# guaranteed to hold only assemblies -- configs/renames.json was a `renames`
# directory that got swept up and processed as one -- and configs/ never
# prunes, so an unfiltered walk mirrors that mistake forever.
# src/finalizeConfigs.ts applies the same rule to decide what to finalize;
# these are two separate walks and each needs it.
log "Copying generated configs to the local 'configs' and 'configs-minimal' directories..."
mkdir -p configs configs-minimal
wanted_names=$(mktemp)
{
  jq -r '.ucscGenomes | keys[]' "$UCSC_BUILT_DIR/list.json"
  echo hgFixed
} >"$wanted_names"

# A short genome list is not a small problem here: it would copy almost nothing
# and make every config it omits look stray to the prune below. UCSC lists 238,
# and nothing short of a truncated response gets near 100.
wanted_count=$(wc -l <"$wanted_names")
if [ "$wanted_count" -lt 100 ]; then
  rm -f "$wanted_names"
  log "ERROR: the UCSC genome list yielded $wanted_count names; refusing to copy or prune configs from it."
  exit 1
fi

while IFS= read -r name; do
  d="$UCSC_BUILT_DIR/$name"
  if [ -f "$d/config.json" ]; then
    cp "$d/config.json" "configs/$name.json"
  fi
  if [ -f "$d/minimal.json" ]; then
    cp "$d/minimal.json" "configs-minimal/$name.json"
  fi
done <"$wanted_names"

# The other direction, which nothing did until now: a file the copy loop will
# never write again stays forever otherwise. Only provable junk is deleted -- see
# prune_stray_configs in common.sh -- and a real config for a vanished db is left
# for scripts/checkOrphanConfigs.mjs to fail the deploy over.
prune_stray_configs configs "$wanted_names"
prune_stray_configs configs-minimal "$wanted_names"
rm -f "$wanted_names"

log "Merging all assembly configs into a single file..."
node src/mergeAll.ts

# After mergeAll, so all-staging.json is derived from a fresh all.json.
log "Writing staging-only config siblings..."
./stageConfigs.sh

log "Merging file access caches..."
node src/mergeFileAccessCache.ts

log "Merging removed tracks..."
node src/mergeRemovedTracks.ts

log "Hashing output files for integrity checking..."
make_file_listing fileListing.txt "$UCSC_BUILT_DIR" \
  ! -name "*meta.json" ! -name "*.hash" ! -name ".trackdb_hash" \
  ! -name ".pipeline_hash" ! -name ".derivation_hash" ! -name ".sync_stamp"

# Write updated hashes for assemblies we just processed.
#
# The converter stamp is written on every mode, including --reprocess-all and
# --skip-download: whatever else those modes skip, the code that just built
# these configs is the code in the working tree, and recording it is what stops
# the next incremental run from reprocessing all 238 again. The trackDb stamp
# keeps its narrower condition -- --skip-download may have processed a copy
# older than upstream, and REPROCESS ignores the stamp anyway.
if [ "${#CHANGED_DL_DIRS[@]}" -gt 0 ]; then
  for assembly_data_dir in "${CHANGED_DL_DIRS[@]}"; do
    assembly=$(basename "$assembly_data_dir")
    built_dir="$UCSC_BUILT_DIR/$assembly"
    if [ -d "$built_dir" ]; then
      printf '%s\n' "$PIPELINE_HASH" >"$built_dir/.pipeline_hash"
      trackdb="$assembly_data_dir/$assembly/database/trackDb.txt.gz"
      if [ -z "${REPROCESS:-}" ] && [ "$SKIP_DOWNLOAD" = false ] && [ -f "$trackdb" ]; then
        xxhsum -H3 "$trackdb" | awk '{print $NF}' >"$built_dir/.trackdb_hash"
      fi
    fi
  done
fi

# Only written once the run has completed, so an interrupted re-derivation is
# retried rather than recorded as done. Safe to write unconditionally here: it
# either bootstraps a missing stamp, is already equal, or REDERIVE was set --
# and REDERIVE implies PIPELINE_HASH moved too, which means every assembly was
# reprocessed and every derived file was therefore visited.
printf '%s\n' "$DERIVATION_HASH" >"$DERIVATION_STAMP"

log "Pipeline finished successfully!"
