---
name: hprc-walk-dp-tag
description:
  A gfa-to-tabix `dp` tag on abridged walk rows would let HPRC's map read walks
  at MHC class II and the 19 other gene windows past the step budget. Twenty
  windows did not justify a 64 GB rebuild on 2026-10-21; take it up when the
  walk file is rebuilt anyway.
---

# A `dp` tag for abridged walks

- **In:** each `abridged` row of a gfa-to-tabix walk file, with a `dp` tag
  listing that path's departures from R
- **Out:** graph-walks' `formsCut` reads the tag instead of expanding the detail
  record, so the page drops `STEP_BUDGET` and `WalkFormsTooLarge`
  (`website/src/components/pangenomeWalkForms.ts`) and reads walks in every
  window
- **Spec:** graph-walks' `docs/structural-forms.md`, "What a `dp` tag must
  list": departures already joined at `joinBp`, plus the pieces under 50 bp
  inside each change, gated on forms equal to the expanded ones at MHC, KIR,
  LPA, AMY1 and the jb2hubs gate windows. Readers skip unknown tags
  (`walkChunk.ts`), so the file keeps format 5

## What it would buy

Measured on ada on 2026-10-21, with the page's `readWalkForms` over the live
file and all 19,369 RefSeq Select genes, each with its 10 kb flanks:

- 20 genes pass the 8 M step budget and fall back to the sidecar in 0.2–3.2 s:
  HLA-DRB1, satellite and segmental-duplication windows (NBPF1, POTEG, DBET,
  RNU1-3), and 0.5–1 Mb genes with one such stretch inside (CAMTA1, CACNA1C,
  DLGAP1, PTPRN2, CNTNAP3)
- The 190 genes next nearest the budget read their walks in at most 4.2 s
  (HLA-DQA1), 156 of them under 2 s, on ada's i9-12900K. A laptop took 6–9 s at
  the LPA and KIR example windows, closer to `WalkFormsTooSlow`'s 12 s
- The fallback costs accuracy where it happens: at MHC class II the sidecar
  splits the window into 120 forms, most of them single haplotypes, where the
  walks give 29 (graph-walks' validation table)

## What it would cost

- A writer in gfa-to-tabix's `walks.rs` that repeats graph-walks'
  `walkDepartures` and `join`, and has to agree with them to the base
- A rebuild of the HPRC walk file from the 64 GB base-level GFA: 39 min and 13
  GB on 24 cores, then a 1.55 GB upload
- An untested alternative: a node pass over the existing file that expands each
  abridged path from its detail record with graph-walks itself and writes the
  tag, which needs no GFA and repeats no logic. Departures that cross a chunk
  edge are the open question

## Take it up when

- The HPRC walk file is rebuilt for another reason (a graph release, a format
  change), which pays the rebuild
- Readers ask for windows in the fallback list, MHC class II above all, since it
  is the tutorial's window
- Another dataset's walk file abridges heavily, such as cattle's once it has one

## Rerunning the measurement

- Sum the `nsteps` column of `abridged` rows (column 9) and of `walk` and `ref`
  rows per chunk with `zcat … | awk`, and rank gene windows by the chunks they
  touch, the one before included. That overstates a window's steps 1.3–1.7 times
  (MHC class II: 14.2 M against the 11.0 M a cut counts)
- Run `readWalkForms` over the windows estimated past 6 M. `WalkFormsTooLarge`
  reports the exact step count, and the rest report their read time
