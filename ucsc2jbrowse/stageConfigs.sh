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

  # The no-arg glob also picks up the loose json files at the top of the built
  # dir (all.json, renames.json), which are not assemblies and not a warning.
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
  run_for_assemblies process_assembly "$UCSC_BUILT_DIR"/*
fi

# all.json is merged after the per-assembly configs, and rewrites their relative
# uris to <assembly>/<file>, which resolves the same from either filename.
if [ -f "$UCSC_BUILT_DIR/all.json" ]; then
  stage_config "$UCSC_BUILT_DIR/all.json"
fi
