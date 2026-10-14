---
name: encode-experiment-connections
description:
  Load ENCODE's 12,000 individual-experiment tracks as connections with UCSC's
  metadata TSVs as facets — waits on someone actually asking for the bulk sets.
---

# ENCODE experiments as faceted connections

The individual-experiment composites (`wgEncodeReg4Epigenetics`, `TfChip`,
`RnaSeq`; 12,363 subtracks on hg38) stay dropped
(`agent-docs/reference/ENCODE_TRACKS.md` has the measurements). If a user turns
up for them, the order of work is:

1. **Join UCSC's metadata TSVs onto `metadata.*`.** The composites carry
   `compositeTrack faceted` plus a `metaDataUrl` TSV (4,964 rows of
   `Accession, TF, Organ, Biosample Type, Life Stage, Biosample, Data Type, Experiment`
   for `wgEncodeReg4TfChip`), which would let the faceted track selector filter
   on TF, organ and biosample. Without it, finding one experiment among
   thousands of checkboxes is not a browse task.
2. **Then the connections.** A prototype worked end to end: a
   `getTrackDisposition` returning keep/connection/remove, and
   `encodeConnections.ts` grouping subtracks by root composite and naming each
   connection from its UCSC shortLabel. It is small enough to rebuild from this
   description.

Connections would also suit the Human Methylation Atlas (the TODO beside
`humanMethylationAtlasSummary` in `ucsc2jbrowse/src/getTrackModifications.ts`)
and FANTOM (7,309 dropped tracks on hg38).
