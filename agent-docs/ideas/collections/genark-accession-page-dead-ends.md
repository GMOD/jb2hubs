---
name: genark-accession-page-dead-ends
description:
  About 40 accessions in the search index have no GenArk config to open, and
  about 1 hub in 300 has no gene track for its launch to name. Measured
  2026-08-27, neither acted on.
---

# GenArk accession pages that lead nowhere

Both were measured on 2026-08-27 during the gene-order drill-down fix
(`8e9f1c5dfa3`) and judged too rare for machinery. Re-measure before building
anything.

**Accessions the search index lists with no config behind them.** 1 of a
1,200-accession spread sample, so about 40 of 52,000. `GCF_003029065.1` and
`GCF_002831045.1` are two: both are in `website/public/searchIndex.json` on
2026-10-08 and neither has a directory under `hubs/`. Search and the accession
page link to a config that 404s. `genark2jbrowse/src/downloadHubs.ts` has
reported hubs gone upstream since 2026-09-01, so the fix is for
`website/generateSearchIndex.ts` to drop an accession with no committed config,
not a client-side guard.

**Hubs with no gene track.** About 1 in 300 (`GCF_000924235.1`). A launch that
names `&tracks=<acc>-ncbiGff` for such a hub opens with no gene track.
