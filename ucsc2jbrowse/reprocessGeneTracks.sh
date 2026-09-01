#!/bin/bash
#
# reprocessGeneTracks.sh
#
# Force-regenerates every golden-path gene track (the bed2gff outputs) across all
# assemblies, leaving bed/rmsk/config/pif outputs untouched. Ships nothing — run
# ./uploadAll.sh afterwards to push the regenerated tracks.
#
# Why this exists: to re-derive ONLY the gene tracks, without the rest of a
# reprocess. ./make.sh --reprocess-all would get there too, but it also re-runs
# every bed and rmsk derivation, the config generation and the whole finalize
# tail; this is the narrow version for when bed2gff or geneLike.ts is what
# moved and you want the outputs in minutes rather than hours.
#
# It is no longer needed for CORRECTNESS, which is what it was originally for.
# The gates used to key only off input data hashes (trackDb, per-table
# .txt.gz), so a change to the deriving code left every gene track silently
# stale -- exactly the dm6/droPer1 carriage-return bug. DERIVATION_SOURCES in
# make.sh now covers both bed2gff/src and src/geneLike.ts, so a plain ./make.sh
# sets REDERIVE and rebuilds them on its own. Check with ./make.sh --explain,
# which reports the derivation stamp before anything runs.
#
# Only ucsc2jbrowse uses bed2gff; genark2jbrowse is unaffected and needs nothing.
#
# Usage:
#   ./reprocessGeneTracks.sh   # regenerate gene .gff.gz for all assemblies
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
cd "$SCRIPT_DIR"

for arg in "$@"; do
  case $arg in
  --help | -h)
    echo "Usage: $0"
    echo "  Force-regenerate gene .gff.gz for every assembly. The next ./make.sh"
    echo "  sees the newer files and refreshes each assembly's text index."
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

log "Done. Run ./uploadAll.sh to ship the regenerated gene tracks."
