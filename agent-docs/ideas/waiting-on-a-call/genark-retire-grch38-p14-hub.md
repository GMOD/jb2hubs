---
name: genark-retire-grch38-p14-hub
description:
  The GRCh38.p14 GenArk hub (GCF_000001405.40) is gone from hgdownload, and the
  config we publish for it cannot open. Retire it, re-point it, or leave it.
---

# Retire or re-point the GRCh38.p14 GenArk hub

UCSC's `assemblyList.json` still lists `GCF_000001405.40`, but hgdownload no
longer has its directory. On both hgdownload hosts hub.txt, the 2bit,
`chrom.sizes` and every bigBed return 404 (hub.txt still did on 2026-10-14), and
the API answers "genome not found". The config we publish for it cannot open,
and `downloadHubs.ts` lists the hub in its gone-upstream report on every run.

These still name it:

- its permanent url,
  `/hubs/genark/GCF/000/001/405/GCF_000001405.40/config.json`;
- `processedHubJson`, which Desktop reads;
- other hubs' synteny tracks, as their liftOver target.

The accession page launches `/ucsc/hg38` instead, and the synteny drilldown
already routes around the hub. The call is whether to retire the config (links
and Desktop installs name its permanent url), re-point it, or leave it and
accept a dead url. We wrote the pipeline to make none of these calls itself.
