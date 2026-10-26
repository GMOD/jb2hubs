---
name: per-sample-tracks-to-zarr
description:
  Three human track groups list one track per sample (hs1 SGDP copy number, hs1
  T2T ENCODE coverage, hg38 Fiber-seq Compendium; 755 tracks). Each could be one
  MultiQuantitativeTrack read from a Zarr store; none is built.
---

# Per-sample tracks to Zarr

- **In:** one bigBed or bigWig per sample, from hgdownload
- **Out:** one samples × bins Zarr v3 store per group, drawn as one
  `MultiQuantitativeTrack` with a row per sample

## The groups

| Assembly | Group                | Tracks | Files                                                        |
| -------- | -------------------- | ------ | ------------------------------------------------------------ |
| hs1      | SGDP Copy Number     | 319    | bigBed 9+, `/gbdb/hs1/sgdpCopyNumber/<sample>_wssd.bb`       |
| hs1      | T2T Encode           | 190    | 102 bigWig coverage, 88 bigBed peaks                         |
| hg38     | Fiber-seq Compendium | 246    | 41 samples × (Hap1/2, CpG, CpG Hap1/2, CpG diff, Acc, Peaks) |

- An SGDP bigBed holds the copy number in its last column, `ID`, a string such
  as `1.72`, over windows of about 1.5–4 kb. Each track's `longLabel` names the
  population ("S_Mbuti-3 (Mbuti, Africa) copy number estimates"), which can
  become the sample's group.
- A samples × bins matrix holds signal, so the Fiber-seq peaks and the T2T
  ENCODE peaks stay bigBed or get dropped.
- Fiber-seq's three Hap1/2 kinds are already MultiQuantitativeTracks pairing a
  sample's two haplotype bigWigs, so a store gains by merging the 41 samples.

## Tools

- **Plugin:** `cmdcolin/jbrowse-plugin-zarr` (beta; the plugin store does not
  list it yet), `MultiWiggleZarrAdapter`, bundle at
  `https://jbrowse.org/demos/zarr/jbrowse-plugin-zarr.umd.production.min.js`.
  Its README specifies the `jbrowse_signal_matrix` store format and the
  gzip-only codec limit.
- **Writer:** `scripts/build_signal_zarr.ts` in jbrowse-components. `--samples`
  packs one bigWig per sample; `--bed --sample-column --value-column` packs one
  BED holding every sample's segments, which is the SGDP route after
  concatenating the 319 files with the sample name as a column.

## Traps

- **hs1 is hub-backed** (`nibPath hub:/gbdb/hs1/hubs`), so it has no
  `tracks.json` and `addMetadata` applies no drop rule to it. The hs1 branch in
  `getTrackModifications` (SGDP, T2T Encode, CHM13) is dead for that reason.
  Retire the per-sample tracks with `DELETE` entries in `ucscRenames/hs1.json`,
  which `rewriteUcscTrackNames` applies to hub assemblies too. A track retired
  that way never reaches `removedTracks/`, so the unavailable-tracks page does
  not list it.
- **`plugins[].url` can kill a whole session** (`CLAUDE.md`, "Which JBrowse
  reads these configs"). Run `pnpm check-config-compat --plugin Zarr=<path>`
  before naming the plugin in a published config, and prefer a versioned bundle
  url over the demo path.
- **Reading the inputs is bulk hgdownload traffic.** 319 SGDP files plus about
  200 bigWigs is far past `check-track-urls`' budget, so fetch them with rsync,
  as `make.sh` does.
- **Upload the store to our bucket** and name it relatively in the config, as
  `mirrorSidecars` does for the assembly sidecars
  (`hubtools/src/mirrorSidecars.ts`).

## First move

Build the SGDP store for one chromosome with `build_signal_zarr.ts --bed`, load
it beside the per-sample tracks in a scratch hs1 config, and compare a known
copy-number locus by eye before deciding the levels and the whole-genome size.
