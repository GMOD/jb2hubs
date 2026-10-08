---
name: genark-accession-page-dead-ends
description:
  About 1 GenArk hub in 300 has no gene track, so the launch that names one
  opens without it. Measured 2026-08-27, not acted on.
---

# GenArk hubs with no gene track

About 1 hub in 300 has no gene track at all (`GCF_000924235.1`), measured on
2026-08-27 during the gene-order drill-down fix (`8e9f1c5dfa3`) and judged too
rare for machinery. A launch that names `&tracks=<acc>-ncbiGff` for such a hub
opens with no gene track. Re-measure before building anything.

The other dead end from that measurement is closed: the 23 accessions UCSC's
assembly list names and has never published are dropped by
`genark2jbrowse/src/processHubJson.ts` since 2026-10-08, so no page lists them.
