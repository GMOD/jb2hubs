---
name: genark-retire-grch38-p14-hub
description:
  GCF_000001405.40, the GRCh38.p14 GenArk hub, is gone from hgdownload but we
  still publish a config for it that cannot open; retire it, re-point it, or
  leave it.
---

# Retire or re-point the GRCh38.p14 GenArk hub

UCSC's `assemblyList.json` still lists `GCF_000001405.40`, but its directory is
gone from both hgdownload hosts: hub.txt, 2bit, `chrom.sizes` and every bigBed
404 (hub.txt still 404 on 2026-10-14), and the API says "genome not found". The
config we publish for it cannot open. `downloadHubs.ts`' gone-upstream report
lists it every run.

What still names it:

- its permanent url,
  `/hubs/genark/GCF/000/001/405/GCF_000001405.40/config.json`;
- `processedHubJson`, which Desktop reads;
- other hubs' synteny tracks, as their liftOver target.

The accession page launches `/ucsc/hg38` instead, and the synteny drilldown
already routes around it. The call is whether to retire the config (a permanent
url that links and Desktop installs name), re-point it, or leave it and accept a
dead url. The pipeline deliberately makes none of these calls on its own.
