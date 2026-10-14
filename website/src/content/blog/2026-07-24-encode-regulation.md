---
title: ENCODE regulation tracks for hg38 and hg19
date: '2026-07-24'
description: >-
  UCSC's layered ENCODE composites now open as one track per mark, with a row or
  an overlay per tissue or cell line, on hg38 and on hg19, which had no ENCODE
  regulation tracks before.
---

UCSC publishes ENCODE regulation signal as layered composites, each one a single
track per mark that overlays dozens of bigWigs in UCSC's own colors. Each
composite now opens in JBrowse as one multi-row track.

On hg38 that covers the ENCODE 4 per-organ DNase, ATAC, H3K4me3, H3K27ac, CTCF
and transcription tracks, and the AlphaMissense, CADD and REVEL per-base scores.

![ENCODE 4 DNase at the beta-globin locus on hg38, one row per organ](/blog-img/2026-07-24-encode-regulation/hg38-dnase-rows.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&session=spec-%7B%22views%22%3A%5B%7B%22type%22%3A%22LinearGenomeView%22%2C%22assembly%22%3A%22hg38%22%2C%22loc%22%3A%22chr11%3A5%2C200%2C000-5%2C320%2C000%22%2C%22tracks%22%3A%5B%22hg38-knownGene%22%2C%7B%22trackId%22%3A%22hg38-wgEncodeReg4Dnase%22%2C%22displaySnapshot%22%3A%7B%22rows%22%3A%22source%22%2C%22height%22%3A640%7D%7D%5D%7D%5D%7D)

## hg19

The layered H3K27ac, H3K4me1, H3K4me3 and transcription tracks are UCSC's
regulation signal for hg19, and the portal had none of them before. Over the
beta-globin locus control region, H3K27ac in the erythroleukemia line K562
stands far above the other six cell lines.

![Layered H3K27ac over the beta-globin locus control region on hg19](/blog-img/2026-07-24-encode-regulation/hg19-lcr.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg19%2Fconfig.json&assembly=hg19&loc=chr11%3A5%2C220%2C000-5%2C340%2C000&tracks=hg19-wgEncodeRegMarkH3k27ac)
