---
name: forward-compat-after-v5
description:
  After the v5 commit, a config naming a type newer than the reader's host
  should cost that host one display or track, never the session. Two checks
  remain open.
---

# Forward compat after v5

A v4 host crashes when it opens a track whose `displays[]` names a type it
lacks;
`agent-docs/architecture-decision-records/0002-config-compat-across-jbrowse-versions.md`
(amendment 2026-08-09) has the mechanism, and
`agent-docs/ideas/waiting-on-someone-else/staged-config-features.md` holds the
two features kept staged for it.

## Settled

- jbrowse-components main drops a display of an unregistered type with a
  warning: `preprocessTrackConfigSnapshot` in
  `packages/core/src/pluggableElementTypes/models/baseTrackConfig.ts`, d9053afb
  (every tag from v5.0.0-beta.1), warning added in a1aa71c.
  `products/jbrowse-web/src/tests/DisplaySnapshotShape.test.tsx` pins it.
- v4.3.0 lacks the filter, so the v4 hosts pay once when v5-only displays reach
  `config.json`.

## Open

1. **`check-config-compat` never opens a track**
   (`scripts/checkConfigCompat.mjs`, `HOST_VERSIONS`), so it cannot see a crash
   that happens on open. Make it open one track per distinct display type on
   each host; `pnpm check-display-types` lists the types. Run it on ada.
2. **The other typed slots are unchecked on main**: a track's `adapter` union,
   an unknown track type, and a session's view and display types. Desktop is the
   exposed reader: `website/src/components/OpenInDesktop.tsx` hands our launch
   specs to whatever Desktop 5.x is installed. Read main, then load a spec
   naming a newer view type into an older v5 tag (beta.1). A throw there wants
   an upstream fix like a1aa71c before v5.0.0 ships.

## Undecided

Production launches from genomes.jbrowse.org could name `config-staging.json`,
since the site launches `main`; web users would get the staged features while
Desktop keeps reading `config.json`.
