---
name: pangenome-followups
description:
  'Open /pangenomes data work: defb and nphp1 lanes that read wrong, the
  callsetBlank flags measured on the old callset, mouse carriage by --call or a
  cactus rebuild, bovine SM:Z: tooltips, and pangenome-build/ to retire.'
---

# Pangenome follow-ups

None of these is committed. The measurements they rest on are in
`agent-docs/reference/PANGENOME_PORTAL.md` and
`agent-docs/reference/PANGENOME_PAGES.md`.

## Lanes and flags that read wrong

- **defb's count overstates "not in the graph".** About 180 of its 390 unplaced
  haplotypes are drawn for 66 kb of the 80 kb window and stop at the one site.
  The MAF summary (`….summary.bed.gz`) could say so in a second 9 to 37 KB read,
  and could let `representative` in `pangenomePanels.ts` prefer the member with
  the most aligned bases.
- **nphp1's commonest lane is "not aligned at 2 sites"**: 326 haplotypes are
  called at the window's first two sites and missing at the 346 kb parent that
  covers the rest.
- **The `callsetBlank` flags in `pangenomeLoci.ts` were measured on `pgbi`.** On
  `wave`, SMN has 515 records where `pgbi` had none, and AMY1 and PRSS have
  insertions that draw at one base. UGT2B17's 117 kb deletion is still a skipped
  path, and NPHP1, SRGAP2 and DEFB are still near empty. Look at each before
  dropping its flag.
- **Not measured:** the 277 of 19,847 no-call states at the five sidecar windows
  where the walks and the raw callset disagree (260 at AMY1), the haplotype
  index's overview, and a comparison of a vcfwave row's pieces against the raw
  record they were cut from.

## Mouse carriage

- **The variant route: `minigraph -cxasm --call` per assembly, then
  `misc/mgutils.js merge -r0`** (both in `~/src/minigraph/README.md`). All 19
  assemblies are on disk, 30 GB in `/mnt/sdb/cdiesh/mousePangenome/fasta/`. The
  run takes hours, calls at bubble resolution, and on its own gives mouse a
  matrix and forms.
- **The minigraph-cactus rebuild is optional.** It buys the GBZ route only, a
  route human got from upstream rather than one we built, so there is no parity
  argument for it. Multi-day on one box.
  `~/mousePangenome/createMousePangenome.sh` is the design
  (`cactus-pangenome … --gfa clip filter --vcf --hal`); it never ran. Worth
  doing only if query-time carriage for mouse is wanted for its own sake.

## Bovine node tooltips

Rebuilding bovine's BEDs through `pggb_gfa_to_bed.py` instead of the rGFA
producer would carry `SM:Z:` into the graph's node tooltips, which human's
rGFA-derived tracks cannot have. PANGENOME_GRAPHS.md's rule is "pick the
producer that matches your file", so that is the consistent choice for a
path-bearing input, but it makes one dataset show something the others do not,
and the callset already supplies carriage. A call on its own merits, not a
consistency fix.

## `pangenome-build/`

The impg route for the same 19-strain mouse panel. Its expensive half ran (987
MB `panel.paf`, indexed `panel.impg`, 2026-06-29) and its per-locus MSA step
never did; 47 GB idle at `/mnt/sdb/cdiesh/mousePangenome/` plus its own build
tree. The per-locus MSA panel it would feed is deleted, so retiring it is the
default. Keep `mouse-loci.tsv` if anything still wants it.
