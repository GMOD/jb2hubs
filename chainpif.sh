#!/bin/bash
#
# chainpif.sh
#
# Shared helpers for downloading UCSC/GenArk chain files and converting them to
# PIF (Pairwise Indexed PAF). Sourced by the createChainTrackPifs.sh scripts.
#
# Before use, callers must set the globals CHAINS_DIR and PIFS_DIR. They may set
# CHAINPIF_DOWNLOAD_DELAY (seconds to sleep before each download; default 0) to
# be polite to the upstream server.
#

: "${CHAINPIF_DOWNLOAD_DELAY:=0}"

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

# Extracts file URLs from an HTML directory listing.
# $1: URL to fetch  $2: grep pattern for files
# Emits nothing (exit 0) if the URL is unreachable.
extract_file_urls() {
  local url="$1" pattern="$2" raw
  raw=$(wget -q -O - "$url" 2>/dev/null) || return 0
  printf '%s\n' "$raw" | parse_href_listing "$pattern"
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

# Converts a chain file to a PIF file.
# $1: path to the chain file (.chain.gz)  $2: output PIF path (.pif.gz)
create_pif() {
  local chain_path="$1" pif_path="$2"
  if [ -n "${REPROCESS:-}" ] || [ ! -f "$pif_path" ] || [ ! -f "$pif_path.csi" ]; then
    log_info "Creating PIF file for $(basename "$chain_path")..."
    local paf_path
    paf_path=$(mktemp) || log_error "Failed to create temporary file"

    if ! pigz -dc "$chain_path" | chain2paf --input /dev/stdin >"$paf_path"; then
      rm -f "$paf_path"
      log_error "Failed to convert chain to PAF for $(basename "$chain_path")"
    fi

    if ! jbrowse make-pif "$paf_path" --csi --out "$pif_path"; then
      rm -f "$paf_path"
      log_error "Failed to create PIF for $(basename "$chain_path")"
    fi

    rm "$paf_path"
  fi
}

# Copies a PIF file and its index to a destination directory.
# $1: source PIF path  $2: destination directory
copy_pif_files() {
  local pif_path="$1" dest_dir="$2"
  cp "$pif_path" "$dest_dir/" || log_error "Failed to copy $pif_path"
  cp "$pif_path.csi" "$dest_dir/" || log_error "Failed to copy $pif_path.csi"
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

  if [[ -z "${REPROCESS:-}" && -f "$dest_dir/$pif_filename" && -f "$dest_dir/$pif_filename.csi" ]]; then
    log_info "PIF file $pif_filename already exists, skipping"
  else
    download_file "$file_url" "$chain_path"
    create_pif "$chain_path" "$pif_path"
    copy_pif_files "$pif_path" "$dest_dir"
  fi
}
