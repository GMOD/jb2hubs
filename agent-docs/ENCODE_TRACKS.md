# ENCODE tracks on genomes.jbrowse.org

What we do with UCSC's ENCODE tracks, why, and what was measured before
deciding. Written 2026-07-24 (hg38 numbers from that day's `trackDb.txt.gz`).

## The two kinds of ENCODE track

UCSC's ENCODE content splits cleanly, and the split is what drives the policy:

**Aggregate composites** are `container multiWig` tracks: one logical track
whose subtracks are per-organ or per-cell-line signal, overlaid
(`aggregate transparentOverlay`), each with its own `color`. hg38 has 13 of
them. Eight have subtracks with a `bigDataUrl` and so are convertible: the
ENCODE 4 per-organ DNase (64), ATAC (34), H3K4me3 (57), H3K27ac (55), CTCF (51)
and transcription (102) sets, plus two 2-subtrack CAGE ones. They answer the
question people actually bring to a browser: is this locus regulatory, and in
which tissue.

The other five are the familiar 2011-era "Layered H3K27Ac / H3K4Me1 / H3K4Me3",
"Transcription" and "DNase Signal" composites. Their subtracks name no
`bigDataUrl` (`type bigWig 0 223899`) and instead point at a golden-path table
holding the file path, which `resolveTableBigFile.ts` reads. That resolution is
what makes them convertible, and it matters most on **hg19**, which has no
ENCODE 4 tracks at all (`wgEncodeReg4*` is hg38-only): those four layered
composites are the only regulation signal UCSC ships for hg19, so without table
resolution we ship none. Verified end to end: hg19 "Layered H3K27Ac" renders as
7 overlaid cell lines in UCSC's own colors, K562 dominant at the HBB locus.

Convertible containers become one `MultiQuantitativeTrack` each, with a
`MultiWiggleAdapter` `subadapters` entry per subtrack carrying its UCSC name and
color, and `defaultRendering: multixyplot` when UCSC declares an overlay
aggregate (see `mergeMultiWigTracks.ts`). One track, N rows, one config entry.
Verified rendering against live UCSC bigWigs in jbrowse-web: 51-row CTCF and
55-row H3K27ac paint with per-organ colors and a legend, no console errors; the
102-row transcription track takes ~20s to fill, since it is 102 range-requested
bigWigs.

The rule is generic, not ENCODE-specific, which is how the per-base
variant-score composites (AlphaMissense, CADD 1.6/1.7, REVEL, MutScore, Umap,
Bismap) also become single 4-row tracks. Those declare no overlay aggregate, so
they keep the one-row-per-subtrack default, which is right for per-nucleotide
scores. The change is purely additive on hg38: 15 aggregate tracks appear and no
existing trackId disappears, so saved sessions can't break.

**Individual experiments** are the faceted composites: `wgEncodeReg4Epigenetics`
(6,353 subtracks on hg38), `wgEncodeReg4TfChip` (4,964), `wgEncodeReg4RnaSeq`
(1,046). One subtrack per ENCODE file accession. These stay dropped, per the
`ENCODE_REASON` rule in `getTrackModifications.ts`.

## Why the individual experiments stay out

They were prototyped as lazily-loaded `JB2TrackHubConnection`s, one per root
composite, each pointing at a sidecar config written beside the assembly's
`config.json` (a connection config is only a pointer; jbrowse-components fetches
a connection's track list when its category is expanded in the track selector).
It worked end to end. It is not shipped because nothing about it answers "who
opens these, and how do they find the one they want":

- Measured cost, real hg38 data: 12 sidecar configs, 6.0MB total, the largest
  5.9MB (0.50MB gzipped). Main `config.json` was unchanged in size.
- Hydration is roughly 1ms per track config in jsdom, dominated by MST config
  creation, not by fetch or parse (parse of the 6MB file was 41ms). So expanding
  the 6,353-track composite is seconds of main-thread work, and the number is a
  property of building a track config, not of the connection.
- Finding one experiment among 4,964 checkboxes is not a browse task. UCSC
  itself doesn't pretend otherwise: those composites carry
  `compositeTrack faceted` plus a `metaDataUrl` TSV (for `wgEncodeReg4TfChip`,
  4,964 rows of
  `Accession, TF, Organ, Biosample Type, Life Stage, Biosample, Data Type, Experiment`).
  Joining that onto `metadata.*` would make our faceted track selector filter on
  TF/organ/biosample, which is the only version of this worth shipping.

So the order of work, if a user does turn up for the bulk sets: join the
metadata TSVs first, then the connections. Connections without the facets is the
weak version.

The connection prototype (a `getTrackDisposition` returning
keep/connection/remove, plus `encodeConnections.ts` grouping subtracks by root
composite and naming the connection from its UCSC shortLabel) is small enough to
rebuild from this description. The same mechanism is what the
`humanMethylationAtlasSummary`/`humanMethylationAtlasSignals` TODO in
`getTrackModifications.ts` wants, and would suit FANTOM (7,309 dropped tracks on
hg38) too.

## Table-backed big* files, beyond ENCODE

`resolveTableBigFile.ts` is generic: any trackDb entry with a `type big*` and no
`bigDataUrl` keeps its path in the table named by its `table` setting (often a
different name than the track's own), as a single `/gbdb/...` value. The
pipeline rsyncs the whole `goldenPath/<db>/database` directory, so this is a
local read, memoized per table.

Scope on hg38, for calibration: 21,798 big* entries name a `bigDataUrl` and 411
do not. Of those 411, the renderable leaves are 321, and every one of them has a
published table (0 unresolvable). 306 of the 321 are the legacy ENCODE
regulation subtracks; the rest are a handful of standalone tracks (GC Percent,
GRC Incident, GWIPS-viz Riboseq, LRG Regions). Most of the _other_ apparently
missing tracks in that list (JASPAR, ReMap, dbVar, ClinGen, PanelApp, EPDnew,
recount3, MITOMAP) turned out to be composite parents whose subtracks do carry a
`bigDataUrl`, so they were already in the configs — the table-backed set is
narrower than it first looks.

A table split across sequences (several distinct paths) resolves to nothing
rather than to an arbitrary row, which would silently be a track covering one
chromosome.

## Related

- `ucsc2jbrowse/src/mergeMultiWigTracks.ts` — the aggregation
- `ucsc2jbrowse/src/resolveTableBigFile.ts` — table-backed file resolution
- `ucsc2jbrowse/src/getTrackModifications.ts` — the drop rules
- `ucsc2jbrowse/common.sh` `is_skipped_track` — the separate policy for
  `wgEncode*` golden-path _database tables_, which are never materialized at all
