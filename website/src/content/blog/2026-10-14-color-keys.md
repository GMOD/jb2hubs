---
title: Color keys for UCSC tracks
date: '2026-10-14'
description: >-
  About 550 UCSC tracks colored by their own files now have a key that names
  each color, from GENCODE transcript types to centromeric satellite classes and
  CRISPR guide quality.
---

Many UCSC tracks color each feature from a color stored in the file itself, and
UCSC explains those colors only in prose on the track's description page. In
JBrowse they used to draw with no key. About 550 of these tracks now show one.

## GENCODE

The GENCODE gene track tells MANE transcripts, other protein-coding transcripts,
non-coding RNAs and pseudogenes apart by color.

![GENCODE V50 at BRCA1, with the transcript type key](/blog-img/2026-10-14-color-keys/knownGene.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr17%3A43%2C030%2C000-43%2C180%2C000&tracks=hg38-knownGene)

## Centromeric satellites

The T2T-CHM13 satellite annotation colors each array by its class, from the
active alpha-satellite HOR that marks the kinetochore to the HSat and beta
satellites around it.

![The chr9 centromere and pericentromere on T2T-CHM13](/blog-img/2026-10-14-color-keys/censat.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhs1%2Fconfig.json&assembly=hs1&loc=chr9%3A42%2C500%2C000-78%2C500%2C000&tracks=hs1-censat)

## CRISPR guides

The CRISPR target tracks color each guide by how specific it is in the genome
and how well it is predicted to cut.

![CRISPR guides on T2T-CHM13](/blog-img/2026-10-14-color-keys/crispr.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhs1%2Fconfig.json&assembly=hs1&loc=chr7%3A50%2C000%2C000-50%2C002%2C500&tracks=hs1-crisprHs1)

## Other tracks

Other tracks with a new key include:

- gnomAD constraint (LOEUF, missense Z-scores, pHaplo and pTriplo)
- the copy-number tracks of every Simons Genome Diversity Project sample
- TOGA gene-loss classes
- GTEx eQTL tissues
- ClinVar CNV type and significance
- RefSeq alignment differences
- VISTA enhancers, MPRA and TargetScan sites

A track still draws the colors stored in its file. The key names them, so a
color it doesn't list still draws as before.
