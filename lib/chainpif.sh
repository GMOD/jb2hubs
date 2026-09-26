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

# Sets JBROWSE_CLI_VERSION, once per shell: one line naming the CLI build,
# stamped beside every PIF and in each liftOver dir's .checked file. A stamp
# that differs from it (or an empty one, the pre-5.0 `touch` format) means the
# output was built by another make-pif and is rebuilt.
#
# Assigning rather than echoing is what makes the memo work. Every caller wants
# it inside a comparison, and `$(jbrowse_cli_version)` there is a subshell, so
# the cached value was discarded on every call -- one `node jbrowse --version`
# per hub, 52,722 of them, ~21 minutes for the genark gate to decide it had
# nothing to do. Exported so a `parallel` child inherits it rather than re-asking.
load_jbrowse_cli_version() {
  if [ -z "${JBROWSE_CLI_VERSION:-}" ]; then
    JBROWSE_CLI_VERSION=$("$JBROWSE_CLI" --version) || log_error "$JBROWSE_CLI --version failed; run pnpm install"
    [ -n "$JBROWSE_CLI_VERSION" ] || log_error "$JBROWSE_CLI --version printed nothing"
    export JBROWSE_CLI_VERSION
  fi
}

jbrowse_cli_version() {
  load_jbrowse_cli_version
  printf '%s\n' "$JBROWSE_CLI_VERSION"
}

# $1: stamp path. True when the stamp records the current CLI. `read` rather
# than `$(cat)` for the same reason: the gate runs this once per hub.
pif_stamp_current() {
  local stamp=''
  load_jbrowse_cli_version
  [ -f "$1" ] || return 1
  IFS= read -r stamp <"$1" || true
  [ "$stamp" = "$JBROWSE_CLI_VERSION" ]
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
  jbrowse_cli_version >"$1"
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
  status=$(curl -sL --retry 3 -o "$body" -w '%{http_code}' "$url") || status=000
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
    if wget -q -O "$output_path.tmp" "$url"; then
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

# Converts a chain file to a PIF file, unless a PIF built by the current CLI is
# already there (REPROCESS forces it).
# $1: path to the chain file (.chain.gz)  $2: output PIF path (.pif.gz)
# $3: the chain's url, so a corrupt cached copy can be fetched again
create_pif() {
  local chain_path="$1" pif_path="$2" chain_url="${3:-}" rc
  if [ -n "${REPROCESS:-}" ] || ! pif_current "$pif_path"; then
    log_info "Creating PIF file for $(basename "$chain_path")..."
    rm -f "$pif_path.cli"
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
    write_pif_stamp "$pif_path.cli"
  fi
}

# $1: PIF path. True when the PIF, its index and a current CLI stamp all exist.
pif_current() {
  [ -f "$1" ] && [ -f "$1.csi" ] && pif_stamp_current "$1.cli"
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
# the destination, otherwise download, convert, and copy it. Set REPROCESS to a
# non-empty value to force a rebuild even when outputs already exist.
# $1: file URL  $2: filename  $3: extension to strip  $4: destination directory
process_chain_file() {
  local file_url="$1" filename="$2" ext_to_remove="$3" dest_dir="$4"
  local paths chain_path pif_path pif_filename
  readarray -t paths < <(generate_file_paths "$filename" "$ext_to_remove")
  chain_path="${paths[0]}"
  pif_path="${paths[1]}"
  pif_filename=$(basename "$pif_path")

  if [[ -z "${REPROCESS:-}" && -f "$dest_dir/$pif_filename" && -f "$dest_dir/$pif_filename.csi" ]] && pif_current "$pif_path"; then
    log_info "PIF file $pif_filename already exists, skipping"
  else
    download_file "$file_url" "$chain_path"
    create_pif "$chain_path" "$pif_path" "$file_url"
    copy_pif_files "$pif_path" "$dest_dir"
  fi
}
