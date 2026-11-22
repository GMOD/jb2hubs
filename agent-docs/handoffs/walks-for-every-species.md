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
- **Next after fly:**
  - set the clipped-fraction ceiling from fly's
    `out/fly-dm6-mc.stats/clipped-by-genome.tsv`
  - build the carriers-versus-callset gate
  - render a few windows for Colin
  - move `build_mc.sh` into jbrowse-components `scripts/` with a README
