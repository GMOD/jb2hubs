# `parallel … || true` hides a persistent failure

`genark2jbrowse/make.sh` (~156, ~160, ~164) and `ucsc2jbrowse/makePifs.sh`
absorb chain-PIF failures with `|| true`, which hides a systematic breakage as
cleanly as it hides a one-off.

Tolerating partial failure across a 50k-hub sweep is probably deliberate, so the
fix is count-and-report — how many items failed, and enough to find them — not a
bare removal of the `|| true`.

The other half of this item is **done**: both
`git commit … || echo "no changes"` sites in `run.sh` now gate on
`git diff --cached --quiet`, so a real commit failure no longer reports as
"nothing to commit".

Left over from the shell-hardening review.
