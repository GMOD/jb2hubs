#!/bin/bash
#
# lib/chainpif.sh
#
# Shared helpers for downloading UCSC/GenArk chain files and converting them to
# PIF (Pairwise Indexed PAF). Sourced by the createChainTrackPifs.sh scripts.
#
# Before use, callers must set the globals CHAINS_DIR and PIFS_DIR. They may set
# CHAINPIF_DOWNLOAD_DELAY (seconds to sleep before each download; default 0) to
# be polite to the upstream server.
#

: "${CHAINPIF_DOWNLOAD_DELAY:=0}"

# JBROWSE_CLI (the repo's pinned @jbrowse/cli, not whatever `jbrowse` is on
# PATH) is defined by lib/common.sh, which every pipeline script sources. The
# two createChainTrackPifs.sh entry points source only this file, so pick it up
# from there rather than keeping a second copy of the path.
[ -n "${JBROWSE_CLI:-}" ] || source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# Sets PIF_FORMAT, once per shell: `pif v<N>`, the format generation the pinned
# make-pif writes (`make-pif --format-version`), stamped beside every PIF and in
# each liftOver dir's .checked. A PIF is rebuilt only when that generation moves;
# a CLI release that writes the same format rebuilds nothing, because a PIF's
# bytes follow its format version, not the CLI's (jbrowse-components ADR-235).
#
# Assigning rather than echoing is what makes the memo work: the genark gate
# compares a stamp once per hub, 52,722 of them, and a `$(...)` there would fork
# the CLI each time. Exported so a `parallel` child inherits it.
load_pif_format() {
  if [ -z "${PIF_FORMAT:-}" ]; then
    local n
    n=$("$JBROWSE_CLI" make-pif --format-version) || log_error "$JBROWSE_CLI make-pif --format-version failed; run pnpm install"
    [[ "$n" =~ ^[0-9]+$ ]] || log_error "make-pif --format-version printed '$n', not a format number"
    PIF_FORMAT="pif v$n"
    export PIF_FORMAT
  fi
}

# $1: stamp path. True when the stamp records the current PIF format. `read`
# rather than `$(cat)` for the same reason: the gate runs this once per hub.
pif_stamp_current() {
  local stamp=''
  load_pif_format
  [ -f "$1" ] || return 1
  IFS= read -r stamp <"$1" || true
  [ "$stamp" = "$PIF_FORMAT" ]
}

# $1: a UCSC liftOver dir's .checked stamp. True when it is current and younger
# than LIFTOVER_RECHECK_DAYS. Nothing else tells a UCSC assembly that upstream
# added a chain, so the listing is asked again once the stamp ages out; the
# PIFs already built are kept.
LIFTOVER_RECHECK_DAYS=${LIFTOVER_RECHECK_DAYS:-30}
liftover_stamp_current() {
  local age
  pif_stamp_current "$1" && stamp_age_days age "$1" && [ "$age" -lt "$LIFTOVER_RECHECK_DAYS" ]
}

# $1: stamp path
write_pif_stamp() {
  load_pif_format
  printf '%s\n' "$PIF_FORMAT" >"$1"
}

# Runs jobs that each list or download from hgdownload, eight at a time and
# starting at most five a second. Same arguments as run_parallel_reporting.
run_hgdownload_jobs() {
  local label="$1"
  shift
  run_parallel_reporting "$label" -j8 --delay 0.2 "$@"
}

# Logs an info message with a timestamp.
log_info() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*"
}

# Logs an error message and exits. Under GNU parallel this fails only the job
# for the current chain file, not the whole batch.
log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
  exit 1
}

# Parses an HTML directory listing on stdin, emitting the href targets that
# match a pattern. Pure (no network), so it can be unit tested.
# $1: grep pattern for the hrefs to keep
parse_href_listing() {
  local pattern="$1"
  grep -oP 'href="\K[^"]+' | { grep "$pattern" || true; }
}

# Extracts file URLs from an HTML directory listing. A 404 is an empty listing;
# any other failure exits, because every caller stamps an empty listing as done
# and a stamped directory is never listed again.
# $1: URL to fetch  $2: grep pattern for files
extract_file_urls() {
  local url="$1" pattern="$2" body status
  body=$(mktemp) || log_error "Failed to create temporary file"
  status=$(curl -sL --retry 3 --connect-timeout 30 --max-time 120 -o "$body" -w '%{http_code}' "$url") || status=000
  case "$status" in
  200) parse_href_listing "$pattern" <"$body" ;;
  404) ;;
  *)
    rm -f "$body"
    log_error "Listing $url failed (HTTP $status)"
    ;;
  esac
  rm -f "$body"
}

# Emits the chain path then the PIF path (one per line) for a chain filename,
# using the CHAINS_DIR and PIFS_DIR globals.
# $1: filename  $2: extension to strip (e.g. ".over.chain.gz" or ".chain.gz")
generate_file_paths() {
  local filename="$1" ext_to_remove="$2" base
  base="${filename%"$ext_to_remove"}"
  echo "$CHAINS_DIR/$filename"
  echo "$PIFS_DIR/$base.pif.gz"
}

# Downloads a file atomically if it doesn't already exist.
# $1: URL  $2: output path
download_file() {
  local url="$1" output_path="$2"
  if [ ! -f "$output_path" ]; then
    log_info "Downloading $(basename "$output_path")..."
    if [ "$CHAINPIF_DOWNLOAD_DELAY" != 0 ]; then
      sleep "$CHAINPIF_DOWNLOAD_DELAY"
    fi
    # wget's defaults are a 900s read timeout and 20 tries, over an hour on
    # one stalled hgdownload connection.
    if wget -q --timeout=60 --tries=3 -O "$output_path.tmp" "$url"; then
      mv "$output_path.tmp" "$output_path"
    else
      rm -f "$output_path.tmp"
      log_error "Failed to download $url"
    fi
  else
    log_info "File $(basename "$output_path") already exists, skipping download"
  fi
}

# Decompresses a chain into a PAF. Returns 2 when the chain itself would not
# decompress and 1 when chain2paf refused it: a cached chain is never
# re-fetched, so a truncated one fails every run forever, and that is worth
# telling apart from bad chain content. pigz's own exit status cannot decide
# it: a chain2paf that exits early SIGPIPEs pigz on a perfectly good chain, so
# the failure path asks pigz -t instead.
# $1: chain path  $2: output PAF path
chain_to_paf() {
  local chain_path="$1" paf_path="$2"
  if pigz -dc "$chain_path" | chain2paf --input /dev/stdin >"$paf_path"; then
    return 0
  fi
  pigz -t "$chain_path" 2>/dev/null && return 1 || return 2
}

# Converts a chain file to a PIF file, unless a PIF of the current format is
# already there (REBUILD_PIFS forces it).
# $1: path to the chain file (.chain.gz)  $2: output PIF path (.pif.gz)
# $3: the chain's url, so a corrupt cached copy can be fetched again
create_pif() {
  local chain_path="$1" pif_path="$2" chain_url="${3:-}" rc
  if [ -n "${REBUILD_PIFS:-}" ] || ! pif_current "$pif_path"; then
    log_info "Creating PIF file for $(basename "$chain_path")..."
    rm -f "$pif_path.format"
    local paf_path
    paf_path=$(mktemp) || log_error "Failed to create temporary file"

    chain_to_paf "$chain_path" "$paf_path" && rc=0 || rc=$?

    # Chains downloaded before the atomic tmp+mv landed can be truncated (an
    # aborted run left a partial file that every later run counted as cached),
    # and a size comparison cannot see that. Refetching is the only repair.
    if [ "$rc" = 2 ] && [ -n "$chain_url" ]; then
      log_info "$(basename "$chain_path") does not decompress; re-downloading"
      rm -f "$chain_path"
      download_file "$chain_url" "$chain_path"
      chain_to_paf "$chain_path" "$paf_path" && rc=0 || rc=$?
    fi

    if [ "$rc" != 0 ]; then
      rm -f "$paf_path"
      log_error "Failed to convert chain to PAF for $(basename "$chain_path")"
    fi

    if ! "$JBROWSE_CLI" make-pif "$paf_path" --csi --out "$pif_path"; then
      rm -f "$paf_path"
      log_error "Failed to create PIF for $(basename "$chain_path")"
    fi

    rm "$paf_path"
    write_pif_stamp "$pif_path.format"
  fi
}

# $1: PIF path. True when the PIF, its index and a current format stamp all exist.
pif_current() {
  [ -f "$1" ] && [ -f "$1.csi" ] && pif_stamp_current "$1.format"
}

# Copies a PIF file and its index to a destination directory.
# $1: source PIF path  $2: destination directory
copy_pif_files() {
  local pif_path="$1" dest_dir="$2" name
  name=$(basename "$pif_path")
  cp "$pif_path" "$dest_dir/.$name.tmp" || log_error "Failed to copy $pif_path"
  cp "$pif_path.csi" "$dest_dir/.$name.csi.tmp" || log_error "Failed to copy $pif_path.csi"
  rm -f "$dest_dir/$name.csi"
  mv "$dest_dir/.$name.tmp" "$dest_dir/$name"
  mv "$dest_dir/.$name.csi.tmp" "$dest_dir/$name.csi"
}

# Runs the full pipeline for one chain file: skip if the PIF already exists in
# the destination, otherwise download, convert, and copy it. Set REBUILD_PIFS to a
# non-empty value to force a rebuild even when outputs already exist.
# $1: file URL  $2: filename  $3: extension to strip  $4: destination directory
process_chain_file() {
  local file_url="$1" filename="$2" ext_to_remove="$3" dest_dir="$4"
  local paths chain_path pif_path pif_filename
  readarray -t paths < <(generate_file_paths "$filename" "$ext_to_remove")
  chain_path="${paths[0]}"
  pif_path="${paths[1]}"
  pif_filename=$(basename "$pif_path")

  if [[ -z "${REBUILD_PIFS:-}" && -f "$dest_dir/$pif_filename" && -f "$dest_dir/$pif_filename.csi" ]] && pif_current "$pif_path"; then
    log_info "PIF file $pif_filename already exists, skipping"
  else
    download_file "$file_url" "$chain_path"
    create_pif "$chain_path" "$pif_path" "$file_url"
    copy_pif_files "$pif_path" "$dest_dir"
  fi
}

# Runs process_chain_file on every url, each in a subshell so log_error's exit
# ends only that chain. Returns 1 after the last url when any failed; callers
# withhold their stamp on it so the next run retries. Call it as a plain
# command, never under `if` or `||`: bash switches off errexit for everything a
# function runs in such a context, so a chain's unchecked failure would pass.
# $1: extension to strip  $2: destination directory  $3: newline-separated urls
process_chain_urls() {
  local ext_to_remove="$1" dest_dir="$2" urls="$3" url rc failed=0 errexit=${-//[^e]/}
  set +e
  while IFS= read -r url; do
    [ -n "$url" ] || continue
    (
      set -e
      process_chain_file "$url" "$(basename "$url")" "$ext_to_remove" "$dest_dir"
    ) </dev/null
    rc=$?
    [ "$rc" -eq 0 ] || failed=$((failed + 1))
  done <<<"$urls"
  [ -z "$errexit" ] || set -e
  if [ "$failed" -gt 0 ]; then
    echo "$failed chain(s) failed in $dest_dir" >&2
    return 1
  fi
}
