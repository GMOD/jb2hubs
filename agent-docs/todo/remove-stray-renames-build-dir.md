# `rm -rf "$UCSC_BUILT_DIR/renames"` on the build machine

Not done, and it is the one that matters. The 2026-08-05 deletion treated the
symptom: by 2026-08-08 `renames.json` was back in **both** trees (`configs/` and
`configs-minimal/`), swept up from `ucscRenames/hg38.json` and processed as if
it were a config. Deleted again, but nothing stops a third return except this
line.

It no longer comes back silently, at least. `checkPluginUrls.mjs` fails on any
file in those directories whose `assemblies[0]` has no name — which is what a
swept-up rename map looks like — and it runs in `gate_configs` before every
upload. The plugin check alone could never have caught it: all four of its
`unpkg.com` urls fetched fine and defined their globals. The only visible
symptom for a year was that the script logged `scanned 476 ucsc configs` while
walking 478, and that number is now counted rather than written down.
