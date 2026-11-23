---
name: walks-for-every-species
description:
  Live state of the Minigraph-Cactus rebuilds for every pangenome species. Fly
  is building on ada; where its outputs, scripts and the review notes are.
---

# Walks for every species: live state

The plan is `agent-docs/todo/walks-and-genes-for-every-pangenome.md`.

- **The fly build** runs on ada as
  `/mnt/sdb/cdiesh/build_mc.sh fly-dm6-mc dm6 /mnt/sdb/cdiesh/flyPangenome/build/graph "chr2L … chrM" 90 20`.
  Its outputs, `time.N` and `cactus.N.log` are in
  `/mnt/sdb/cdiesh/mc/fly-dm6-mc/`. It writes `finished` there once the walk
  file passes its header checks.
- **The image and smoke test** are in `/mnt/sdb/cdiesh/cactus-v4/`, the
  evolverPrimates run under `smoke/`. Its walk file read `revisited:i:0`.
- **gfa-to-tabix 5.0.1** is installed at `~/opt/gfa-to-tabix-5.0.1/bin/` on ada;
  `~/.cargo/bin` still holds 5.0.0.
- **Cow's discarded inputs:** the Zenodo cactus GFAs are extracted in
  `/mnt/sdb/cdiesh/bovinePangenome/Zenodo/cactus/`, with the chr29 trial walk
  file in `walks-trial/`. Neither is used.
- **Cow's one-chromosome pilot exists.** A gfa-to-tabix study built chr29 on
  2026-11-22 from the 2023 paper's 12 assemblies with Minigraph-Cactus 4.0.0,
  one chromosome as its own run, `--reference HER` renamed bosTau9 afterwards.
  - Its walk file reads `revisited:i:0`. The build took 1 h 15 min on two
    cores of a loaded ada, 1.4 CPU-hours, 4.1 GB at most.
  - The clipped graph keeps 98.9% of the input: bison 94.8% (its first
    2.27 Mb goes), gaur 98.5%, yak 99.1%, every other member 98.7% or more.
    Per genome: `out/clipped.jsonl`.
  - It used the binary release in `opt/cactus-bin-v4.0.0/`, not the image
    `build_mc.sh` runs, so it is a measurement and not a product of that
    script.
  - On ada: `~/work/walks8-gates/agents/cowmc/` (`scripts/run-mc.sh`, `out/`,
    `logs/`) and `/mnt/sdb/cdiesh/bovinePangenome/mc-trial/` (inputs re-spelled
    from the Zenodo GFAs, outputs, a 4.1 GB job store). The report and twelve
    before and after sheets are on the laptop in
    `~/src/walks8-evidence/sessions-20261122/revisited-study/` (`study/cowmc.txt`,
    `cowmc/`).
  - From the walk file all twelve rebuilt windows draw the reference as one
    line with short bubbles or a single branch. At
    `chr29:5,570,001-5,580,000` the node-and-link index draws the reference as
    a closed ring; nobody has looked into why.
- **Next after fly:**
  - set the clipped-fraction ceiling from fly's
    `out/fly-dm6-mc.stats/clipped-by-genome.tsv`
  - build the carriers-versus-callset gate
  - render a few windows for Colin
  - move `build_mc.sh` into jbrowse-components `scripts/` with a README
