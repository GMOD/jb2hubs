# Run `pnpm check-config-compat` before the next upload

`mergeAll` now emits a deduped plugin list — 4 entries where it used to emit 12
— and that has been verified structurally and by unit test, but never booted in
a real browser.
