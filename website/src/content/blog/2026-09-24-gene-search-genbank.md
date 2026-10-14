---
title: Gene search in GenBank-only genomes
date: '2026-09-24'
description: >-
  About 8,000 GenBank-only assemblies, which have no NCBI gene annotation, now
  answer a gene-name search such as BRCA2 or TP53, through RefSeq genes that
  UCSC maps onto them from other species.
---

A GenBank-only (GCA) assembly has no NCBI gene annotation, so typing a gene name
into its search box used to find nothing. About 8,000 of these assemblies now
find genes by name.

The names come from UCSC's "RefSeq mRNAs (xeno)" track, which aligns RefSeq
transcripts from other species to each genome. Searching the narwhal genome for
BRCA2 opens its BRCA2 locus.

![BRCA2 found by name in the narwhal genome](/blog-img/2026-09-24-gene-search-genbank/narwhal-brca2.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fhubs%2Fgenark%2FGCA%2F005%2F190%2F385%2FGCA_005190385.4%2Fconfig.json&assembly=GCA_005190385.4&loc=BRCA2&tracks=GCA_005190385.4-xenoRefGene),
or start from the [narwhal's page](/accession/GCA_005190385.4/).
