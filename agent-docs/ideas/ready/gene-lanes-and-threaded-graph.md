---
name: gene-lanes-and-threaded-graph
description:
  'Give every /pangenomes species the hazelnut demo shape: genes on every
  haplotype lane, lanes and a walk-threaded graph in one view, and sites picked
  by a genes-in-bubbles scan. Walk files in format 8.'
---

# Gene lanes and a threaded graph for every pangenome

The private HzPanV6 demo (`~/src/jb2plugins/hazelnut-demo-private`, its
`README.md` and `report/hazelnut-haplotypes.pdf`) found sites nobody had asked
about and drew each one well. Colin called it "pretty successful" (2026-11-18)
and wants the same for the datasets here, targeting the format 8 plugin release.

## What the demo has

- **Every haplotype is an assembly with its own genes.** 34 assemblies, each a
  `ChromSizesAdapter` only, and a gene track per haplotype; the lanes name both
  with `laneGeneTracks: ['genes', '{assembly}-genes']`.
- **One walk file feeds two displays in one linear view.** A Minigraph-Cactus
  graph through `gfa-to-tabix --walks` gives `MultiWaySyntenyDisplay` lanes and
  a `LinearGraphDisplay` with `walkLayers` threading the lanes' haplotypes
  (`siteGraph()` in `shots-v4.mjs`).
- **The data picks the sites.** `scout_bubbles.sh` keeps reference genes wholly
  inside a bubble whose alleles differ by 5 to 60 kb (378 bubbles);
  `scout_deletions.py` counts the haplotypes whose allele is under a fifth of
  the reference's.

## Where each dataset stands

- **Human** has the walk file and a gene track per haplotype
  (`Per-haplotype gene models`, `agent-docs/reference/PANGENOME_PORTAL.md`). It
  lacks a launch with the lanes and a walk-threaded graph together: its graph
  launch reads the rGFA, which has no paths. Its walk file is format 7
  (`hprc-v2.1-mc-grch38-f7`); a format 8 file gets a new name, as the format 5
  to 7 move did.
- **Mouse, bovine, Arabidopsis, fly, rice, tomato and dog** have one assembly
  each and minigraph graphs without paths, so `--walks` cannot run on them.

## The work

- **The genes-in-bubbles scan, every dataset.** Needs nothing new: each dataset
  has a per-haplotype callset and reference genes. Its candidate list decides
  which datasets earn the rest.
- **The human combined launch**, on a format 8 walk file, once the plugin
  release reads format 8. `pnpm check-config-compat --plugin` before it ships.
- **Bovine walks** from the published Zenodo `cactus` GFAs (26.1 GB, never
  extracted, `/mnt/sdb/cdiesh/bovinePangenome/Zenodo/`), no rebuild.
- **The rest need a `cactus-pangenome` rebuild.** Mouse's is several days on one
  box (`~/mousePangenome/createMousePangenome.sh`); fly's genome is the
  smallest, so try it first. One heavy job on ada at a time, under the memory
  cap.
- **Member gene models.** NCBI annotation where a member has it, Liftoff from
  the reference otherwise (as HG002 got). Liftoff only projects reference genes,
  so it shows a gene a haplotype lacks but never a gene only an insertion
  carries; the demo's per-haplotype BRAKER4 models could.
