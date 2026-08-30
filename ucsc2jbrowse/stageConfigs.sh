#!/bin/bash

#
# stageConfigs.sh
#
# Writes a `config-staging.json` beside every generated `config.json` (and an
# `all-staging.json` beside `all.json`): the same config plus the plugins that
# are only enabled on staging.genomes.jbrowse.org. This is the only way to stage
# a config-level feature at all, since regenerating config.json publishes it to
# production and staging alike.
#
# A SIBLING FILE rather than a parallel /ucsc-staging/ tree, because a UCSC
# config names most of its data relatively (centromeres.bed.gz,
# ncbiRefSeq.gff.gz, trix/*) and jbrowse-web resolves those against the config's
# own URL. A config served from another directory would look for its data there
# too; a sibling resolves to exactly the files production already serves, so
# staging costs one small JSON per assembly and duplicates no data.
#
# enhanceConfig is idempotent — plugins dedup by name, the feature-display
# derivation is guarded on `displays === undefined` — so running it again over
# the copy adds the staging plugins and changes nothing else. That is also what
# makes this cheap to run on its own, to flip staging on or off without
# regenerating anything.
#
# Takes built directories, not download directories; with no arguments, every
# assembly under UCSC_BUILT_DIR is processed.
#

set -euo pipefail

source "$(dirname "$0")/common.sh"

# The versioned UMD path — a config that names it picks up compatible updates,
# while a change needing a newer JBrowse than some host runs gets a v2 instead of
# breaking configs already published. See hubtools/src/enhanceConfig.ts.
: "${BLAT_PLUGIN_URL:=https://jbrowse.org/plugins/jbrowse-plugin-blat/dist/v1/jbrowse-plugin-blat.umd.production.min.js}"
export BLAT_PLUGIN_URL

# The RepeatMasker track's "split by repeat class" multi-row display. Staged
# rather than shipped because LinearMultiRowFeatureDisplay landed after v4.3.0,
# and a displays[] entry naming a type the host lacks is a fatal error when the
# track is opened, not a degraded track. Staging launches code/jb2/main, which
# has it. See hubtools/src/repeatClassDisplay.ts.
: "${RMSK_MULTIROW_DISPLAY:=1}"
export RMSK_MULTIROW_DISPLAY

# Absolute, rather than cd'ing, so this stays runnable from anywhere without
# breaking a relative assembly dir passed as an argument.
STAGE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export STAGE_SCRIPT_DIR

stage_config() {
  local config_path=$1
  local staging_path=${config_path%.json}-staging.json
  cp "$config_path" "$staging_path"
  node "$STAGE_SCRIPT_DIR/src/enhanceConfig.ts" "$staging_path"
}
export -f stage_config

process_assembly() {
  local assembly_dir=$1
  local config_path="$assembly_dir/config.json"

  # Only reachable via explicit arguments now: the no-arg path below hands over
  # names it has already confirmed have a config.
  if [ -d "$assembly_dir" ]; then
    if [ ! -f "$config_path" ]; then
      echo "Warning: config.json not found for $(basename "$assembly_dir"), skipping..."
    else
      stage_config "$config_path"
    fi
  fi
}
export -f process_assembly

if [ $# -gt 0 ]; then
  run_for_assemblies process_assembly "$@"
else
  # The same rule make.sh's copy step and src/finalizeConfigs.ts already use:
  # names the current UCSC genome list recognizes, and nothing else.
  # UCSC_BUILT_DIR holds more than assemblies -- a bare `$UCSC_BUILT_DIR/*`
  # hands over the top-level `trix` directory, which is where "config.json not
  # found for trix" came from, and it is the same unfiltered walk that once
  # processed a stray `renames` directory into a published config. Three walks
  # over this tree, one rule. (hgFixed was the exception all three carried until
  # 2026-08-30; make.sh's copy step says why it no longer is.)
  if [ ! -f "$UCSC_BUILT_DIR/list.json" ]; then
    echo "ERROR: $UCSC_BUILT_DIR/list.json is missing; run make.sh first" >&2
    exit 1
  fi
  staged_dirs=()
  while IFS= read -r name; do
    if [ -f "$UCSC_BUILT_DIR/$name/config.json" ]; then
      staged_dirs+=("$UCSC_BUILT_DIR/$name")
    fi
  done < <(jq -r '.ucscGenomes | keys[]' "$UCSC_BUILT_DIR/list.json")
  run_for_assemblies process_assembly "${staged_dirs[@]}"
fi

# all.json is merged after the per-assembly configs, and rewrites their relative
# uris to <assembly>/<file>, which resolves the same from either filename.
if [ -f "$UCSC_BUILT_DIR/all.json" ]; then
  stage_config "$UCSC_BUILT_DIR/all.json"
fi
