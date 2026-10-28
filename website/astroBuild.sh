#!/bin/bash
#
# astroBuild.sh
#
# `astro build`, with its per-route log collapsed into a progress counter, then
# checkBuiltLinks.mjs over the result.
#
# Astro logs one line per generated route with no option short of --silent to
# stop them, and this site has one route per GenArk accession. Only the route
# lines match, so errors pass through. Rationale:
# agent-docs/reference/WEBSITE.md.

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

node checkBuiltLinks.mjs dist
