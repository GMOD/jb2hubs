---
name: ucsc-type-from-trackdb
description:
  The drop rules read a golden-path table's type from a settings blob that has
  no type line, so specializedTypes and the bigMaf rules never fire there.
metadata:
  category: ready
  area: ucsc2jbrowse
  first_move:
    'Feed the trackDb type column into metadata.ucsc.type in trackDbMetadata.ts,
    then diff a scratch build.'
  order: 1
---

# Give the drop rules a golden-path table's type

`getTrackModifications.ts` matches `specializedTypes` (`pgSnp` among them) and
the `bigMaf` rules on `metadata.ucsc.type`, which `withTrackDbMetadata`
(`src/trackDbMetadata.ts`) builds from the trackDb `settings` text. A
golden-path `tracks.json` entry keeps its type in a separate `type` column, and
no hg19 entry has a `type` line in its settings, so those rules never fire on a
golden-path table. No config ships wrong yet, because the `pgSnp*` parent-prefix
rule drops all 209 `pgSnp` tables.

- Pass the `type` column into `ucsc.type` when the settings text has no `type`
  line.
- The change can drop tracks the type rules now match (`bigPsl` golden-path
  tables among them), so diff a scratch build (`--out-root`) before landing, and
  check `keptTables.ts` still agrees with `addMetadata`.

The derivation gate this builds on is recorded in
`agent-docs/reference/UCSC_PIPELINE.md` ("Derivation skips tables the drop rules
discard").
