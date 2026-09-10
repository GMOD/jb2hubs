#!/bin/bash
#
# astroBuild.sh
#
# `astro build`, with its per-route log collapsed into a progress counter.
#
# Astro logs one line per generated route at info level (core/build/generate.js,
# `logRenderTime`), and there is no config knob short of `--silent`, which would
# also drop the vite warnings and the build summary. This site has one route per
# GenArk accession, so on 2026-09-09 those lines were 129,261 of run.sh's 130,796
# log lines -- 98.8% of a full pipeline log, burying every line the pipeline
# itself wrote and making `logs/run_*.log` ~50MB apiece.
#
# Counting them instead keeps this phase's progress visible -- it is otherwise
# 90 seconds of silence -- and leaves everything else astro says intact, errors
# included: only the route lines match.

set -euo pipefail

cd "$(dirname "$0")"

astro build "$@" | awk '
  /[├└]─ / {
    if (++routes % 20000 == 0) {
      printf "  %d routes generated\n", routes
      fflush()
    }
    next
  }
  /page\(s\) built/ { built = 1 }
  { print; fflush() }
  # Only when astro did not get as far as its own "N page(s) built": a build
  # that dies mid-generation would otherwise report no progress at all.
  END { if (routes && !built) printf "  stopped after %d routes\n", routes }
'
