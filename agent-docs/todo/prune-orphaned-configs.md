# Prune `configs/` instead of only documenting it

`make.sh` copies `$UCSC_BUILT_DIR/<db>/config.json` to `configs/<db>.json` and
never removes anything, which is how `renames.json` survived a year and put four
`unpkg.com` plugin urls into `all.json`. Deleting the file fixed the symptom.

Either a prune step in `make.sh` (drop a `configs/<db>.json` with no matching
built dir) or an orphan assertion in `gate_configs` fixes the cause. `hgFixed`
is the one legitimate extra.

Related: [remove-stray-renames-build-dir.md](remove-stray-renames-build-dir.md),
which is the same bug's other half.
