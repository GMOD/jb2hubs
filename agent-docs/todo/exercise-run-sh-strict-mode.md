# `run.sh`'s `set -euo pipefail` has never run end-to-end

It was added by the shell-hardening review and only read statically since. One
real `./run.sh --dry-run` on the deploy box would confirm no `-u` path fires
that a static read cannot reach.
