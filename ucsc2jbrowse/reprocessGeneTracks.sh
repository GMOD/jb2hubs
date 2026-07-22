#!/bin/bash
#
# reprocessGeneTracks.sh
#
# Force-regenerates every golden-path gene track (the bed2gff outputs) across all
# assemblies, leaving bed/rmsk/config/pif outputs untouched. Ships nothing — run
# ./uploadAll.sh afterwards to push the regenerated tracks.
#
# Why this exists: the normal incremental gates key off *input data* hashes
# (trackDb, and per-table .txt.gz), not the version of the tools that derive the
# outputs. A change to bed2gff or src/geneLike.ts leaves those input hashes
# unchanged, so a plain ./make.sh would silently skip every gene track. This
# script forces a rebuild of the gene-track step only.
#
# Only ucsc2jbrowse uses bed2gff; genark2jbrowse is unaffected and needs nothing.
#
# Usage:
#   ./reprocessGeneTracks.sh            # regenerate gene .gff.gz for all assemblies
#   ./reprocessGeneTracks.sh --reindex  # also refresh the ncbiRefSeq text index
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

REINDEX=false
for arg in "$@"; do
  case $arg in
  --reindex)
    REINDEX=true
    ;;
  --help | -h)
    echo "Usage: $0 [--reindex]"
    echo "  (default)   Force-regenerate gene .gff.gz for every assembly"
    echo "  --reindex   Also rerun text indexing. Usually unnecessary: transcript"
    echo "              ids were already searchable via the ID attribute, so the"
    echo "              new Name attribute does not change search coverage."
    exit 0
    ;;
  *)
    echo "Unknown option: $arg"
    echo "Use --help for usage information"
    exit 1
    ;;
  esac
done

# Same assembly set make.sh processes.
mapfile -t dl_dirs < <(list_assembly_dirs)

if [ "${#dl_dirs[@]}" -eq 0 ]; then
  log "No assemblies found under $UCSC_DOWNLOADS_DIR; nothing to do."
  exit 0
fi

log "Force-regenerating gene tracks for ${#dl_dirs[@]} assemblies (REPROCESS=true)..."
REPROCESS=true ./createGeneTracksForGoldenPath.sh "${dl_dirs[@]}"

if [ "$REINDEX" = true ]; then
  built_dirs=()
  for d in "${dl_dirs[@]}"; do
    built_dirs+=("$UCSC_BUILT_DIR/$(basename "$d")")
  done
  log "Refreshing text index for ${#built_dirs[@]} assemblies..."
  ./textIndexGoldenPath.sh "${built_dirs[@]}"
fi

# Keep the integrity listing consistent with the regenerated outputs, matching
# the listing make.sh writes at the end of a normal run.
log "Refreshing output file listing..."
make_file_listing fileListing.txt "$UCSC_BUILT_DIR" \
  ! -name "*meta.json" ! -name "*.hash" ! -name ".trackdb_hash" ! -name ".sync_stamp"

log "Done. Run ./uploadAll.sh to ship the regenerated gene tracks."
