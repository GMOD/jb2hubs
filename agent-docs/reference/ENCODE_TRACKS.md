---
name: encode-tracks
description:
  Which UCSC ENCODE content the portal converts and which it drops, with the
  2026-07-24 numbers behind the split. Read before changing ENCODE track
  handling.
---

# ENCODE tracks on genomes.jbrowse.org

The hg38 numbers below come from the 2026-07-24 `trackDb.txt.gz`.

## The two kinds of ENCODE track

UCSC's ENCODE content falls into aggregate composites, which the portal
converts, and individual experiments, which it drops.

**Aggregate composites** are `container multiWig` tracks: one logical track
whose subtracks hold per-organ or per-cell-line signal, overlaid
(`aggregate transparentOverlay`), each subtrack with a `color` of its own. hg38
has 13 of them. Eight have subtracks with a `bigDataUrl` and so are convertible:
the ENCODE 4 per-organ DNase (64), ATAC (34), H3K4me3 (57), H3K27ac (55), CTCF
(51) and transcription (102) sets, plus two 2-subtrack CAGE ones. These tracks
show whether a locus is regulatory and in which tissue, which is the question
people bring to a browser.

The other five are the 2011-era "Layered H3K27Ac / H3K4Me1 / H3K4Me3",
"Transcription" and "DNase Signal" composites. Their subtracks name no
`bigDataUrl` (`type bigWig 0 223899`); a golden-path table holds the file path
instead, and `resolveTableBigFile.ts` reads it. Table resolution matters most on
**hg19**, which has no ENCODE 4 tracks (`wgEncodeReg4*` is hg38-only): the four
layered composites are the only regulation signal UCSC ships for hg19, so
without table resolution we would ship none. We verified hg19 "Layered H3K27Ac"
end to end; it renders as 7 overlaid cell lines in UCSC's colors, with K562
dominant at the HBB locus.

`mergeMultiWigTracks.ts` turns each convertible container into one
`MultiQuantitativeTrack` config entry, with a `MultiWiggleAdapter` `subadapters`
entry per subtrack holding its UCSC name and color, and sets
`defaultRendering: xyplot` when UCSC declares an overlay aggregate. We checked
the rendering against live UCSC bigWigs in jbrowse-web: the 51-row CTCF and
55-row H3K27ac tracks paint with per-organ colors and a legend and log no
console errors, and the 102-row transcription track takes ~20s to fill, since it
range-requests 102 bigWigs.

The merge rule applies to any overlay container, so the per-base variant-score
composites (AlphaMissense, CADD 1.6/1.7, REVEL, MutScore, Umap, Bismap) also
become single 4-row tracks. They declare no overlay aggregate, so they keep the
one-row-per-subtrack default, which suits per-nucleotide scores. On hg38 the
change only adds tracks: 15 aggregate tracks appear and every existing trackId
stays, so saved sessions keep working.

**Individual experiments** are the faceted composites: `wgEncodeReg4Epigenetics`
(6,353 subtracks on hg38), `wgEncodeReg4TfChip` (4,964) and `wgEncodeReg4RnaSeq`
(1,046), with one subtrack per ENCODE file accession. The `encode`/`wgEncode`
trackId prefix rule in `getTrackModifications.ts` drops them.

## Why the individual experiments stay out

We prototyped them as lazily loaded `JB2TrackHubConnection`s, one per root
composite, each pointing at a sidecar config written beside the assembly's
`config.json`. A connection config holds only a pointer; jbrowse-components
fetches a connection's track list when the user expands its category in the
track selector. The prototype worked end to end, and we did not ship it because
it gave a user no way to find the experiment they want:

- Measured on real hg38 data, the prototype wrote 12 sidecar configs, 6.0MB in
  total, the largest 5.9MB (0.50MB gzipped). Main `config.json` kept its size.
- Building a track config costs roughly 1ms per track in jsdom, most of it in
  MST config creation (parsing the 6MB file took 41ms). Expanding the
  6,353-track composite therefore takes seconds of main-thread work, however the
  tracks arrive.
- A user looking for one experiment among 4,964 checkboxes needs a search. UCSC
  marks those composites `compositeTrack faceted` and gives each a `metaDataUrl`
  TSV (for `wgEncodeReg4TfChip`, 4,964 rows of
  `Accession, TF, Organ, Biosample Type, Life Stage, Biosample, Data Type, Experiment`).
  Joining that TSV onto `metadata.*` would let our faceted track selector filter
  on TF, organ and biosample, and that is the only version worth shipping.

The proposal to load them, metadata facets first and connections after, is
`agent-docs/ideas/waiting-on-someone-else/encode-experiment-connections.md`.

## Table-backed big\* files, beyond ENCODE

`resolveTableBigFile.ts` handles any trackDb entry with a `type big*` and no
`bigDataUrl`. The entry's path is a single `/gbdb/...` value in the table its
`table` setting names, often under a name other than the track's. The pipeline
rsyncs the whole `goldenPath/<db>/database` directory, so the lookup reads a
local file, memoized per table.

On hg38, 21,798 big\* entries name a `bigDataUrl` and 411 do not. Of those 411,
321 are renderable leaves, and every one has a published table (0 unresolvable).
306 of the 321 are the legacy ENCODE regulation subtracks; the rest are a few
standalone tracks (GC Percent, GRC Incident, GWIPS-viz Riboseq, LRG Regions).
Most of the other apparently missing tracks in that list (JASPAR, ReMap, dbVar,
ClinGen, PanelApp, EPDnew, recount3, MITOMAP) are composite parents whose
subtracks name a `bigDataUrl`, so the configs already had them, and the
table-backed set is narrower than the list suggests.

When a table lists several distinct paths, one per sequence, the resolver
returns nothing instead of an arbitrary row, which would yield a track that
covers one chromosome and reports no error.

## Related

- `ucsc2jbrowse/src/mergeMultiWigTracks.ts` — the aggregation
- `ucsc2jbrowse/src/resolveTableBigFile.ts` — table-backed file resolution
- `ucsc2jbrowse/src/getTrackModifications.ts` — the drop rules
- `ucsc2jbrowse/common.sh` `is_skipped_track` — the separate policy for
  `wgEncode*` golden-path _database tables_, which the pipeline never
  materializes
