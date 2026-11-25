---
title: GeneHancer, COSMIC and DECIPHER from the UCSC API
date: '2026-11-25'
description: >-
  hg38 and hg19 now list the GeneHancer, COSMIC mutation and DECIPHER population
  CNV tracks, which JBrowse reads from the UCSC Genome Browser API because UCSC
  does not offer their files for download.
image: /blog-img/2026-11-25-ucsc-api-tracks/genehancer-myc.png
---

The portal builds its UCSC tracks from the files UCSC publishes on hgdownload.
UCSC does not publish the files of some tracks, including GeneHancer, COSMIC and
the DECIPHER population CNVs, but its
[Genome Browser API](https://genome.ucsc.edu/goldenPath/help/api.html) returns
their features for a region. These tracks now appear on hg38 and hg19, and
JBrowse fetches each one from the API when you open it, through the
[UCSC plugin](https://github.com/cmdcolin/jbrowse-plugin-ucsc-api).

## GeneHancer

**Regulation › GeneHancer** lists the regulatory elements, the gene TSSs and the
interactions between them, each in a full and a double-elite version as on UCSC,
with the elements and interactions in UCSC's colors.

![GeneHancer elements, interactions and gene TSSs around MYC and PVT1 on hg38](/blog-img/2026-11-25-ucsc-api-tracks/genehancer-myc.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr8%3A127%2C600%2C000-128%2C000%2C000&tracks=hg38-geneHancerRegElementsDoubleElite,hg38-geneHancerInteractionsDoubleElite,hg38-geneHancerGenesDoubleElite,hg38-knownGene)

## COSMIC and DECIPHER

**Phenotypes, Variants, and Literature** lists COSMIC mutations (COSMIC v101)
and the DECIPHER population CNVs.

![COSMIC mutations over TP53 on hg38](/blog-img/2026-11-25-ucsc-api-tracks/cosmic-tp53.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr17%3A7%2C668%2C000-7%2C688%2C000&tracks=hg38-cosmicMuts,hg38-knownGene)

## Limitations

- **UCSC must be reachable.** When api.genome.ucsc.edu is down, these tracks
  show an error and the rest of the session keeps working.
- **Zoom in for dense regions.** A region with more than 20,000 features asks
  you to zoom in.
- **Protected tracks are unavailable.** The API refuses the tracks UCSC marks as
  protected, such as HGMD, SpliceAI and PrimateAI.
- **JBrowse 4.3.0** draws these tracks in one default color.
