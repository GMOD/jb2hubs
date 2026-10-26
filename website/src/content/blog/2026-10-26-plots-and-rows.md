---
title: Plots and rows for UCSC tracks
date: '2026-10-26'
description: >-
  JASPAR, gnomAD and the GWAS Catalog now open as plots of their own score
  columns; ClinVar and ENCODE cCREs can split into rows; mobile element
  insertions merge into one track; and ClinGen CNVs gain a coverage plot.
---

Many UCSC tracks store a number or a class in each feature, such as a motif
score, an allele frequency, a p-value or a clinical significance. JBrowse used
to draw all of them as stacked boxes, so the column that matters was only
visible one feature at a time, in a popup. A handful of tracks now plot that
column or sort features into rows by it.

Each display is a short block of track config written in JBrowse's marks
grammar: a mark (point, rule, bar), a field for each axis and a color scale. The
hub builder writes these configs, and no track needed new JBrowse code.

To get the boxes back, open the track menu and pick another entry under
**Display types**.

## JASPAR transcription factor sites

JASPAR predicts binding sites for hundreds of transcription factors, so 10 kb
around TP53 holds 53,888 of them. As boxes, the track is a wall of yellow.

![JASPAR 2026 at TP53 as packed boxes](/blog-img/2026-10-26-plots-and-rows/jaspar-before.png)

The track now plots each site's score, which is -log10(p) × 100, keeps sites
with p < 1e-5 and colors them by strand. That leaves 389 sites, and the
strongest stand out.

![JASPAR 2026 at TP53 as a score plot](/blog-img/2026-10-26-plots-and-rows/jaspar-after.png)

Zoomed in, each site spans its motif and carries its transcription factor's
name.

![JASPAR 2026 over 150 bp, with transcription factor names](/blog-img/2026-10-26-plots-and-rows/jaspar-zoomed.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr17%3A7%2C668%2C000-7%2C678%2C000&tracks=hg38-jaspar2026)

hg38 now lists only JASPAR 2026, and hg19 only JASPAR 2024, its newest release.

## gnomAD allele frequencies

The gnomAD v4.1 genomes track lists every variant seen in 76,215 genomes. As
boxes, the common variants and the singletons look the same.

![gnomAD v4.1 genomes at TP53 as packed boxes](/blog-img/2026-10-26-plots-and-rows/gnomad-before.png)

The track now plots allele frequency on a log scale, so the common variants sit
at the top, and it colors coding variants by their consequence.

![gnomAD v4.1 genomes at TP53 plotted by allele frequency](/blog-img/2026-10-26-plots-and-rows/gnomad-after.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr17%3A7%2C668%2C402-7%2C670%2C000&tracks=hg38-gnomadGenomesVariantsV4_1)

## GWAS Catalog

The 9p21 locus near CDKN2A and CDKN2B holds associations with coronary disease,
type 2 diabetes and several cancers.

![GWAS Catalog at 9p21 as packed boxes](/blog-img/2026-10-26-plots-and-rows/gwas-before.png)

The GWAS Catalog track now opens as a Manhattan plot of -log10(p).

![GWAS Catalog at 9p21 as a Manhattan plot](/blog-img/2026-10-26-plots-and-rows/gwas-after.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr9%3A21%2C900%2C000-22%2C200%2C000&tracks=hg38-gwasCatalog)

## ClinVar

Across BRCA1, ClinVar's packed track mixes every clinical significance into one
stack.

![ClinVar SNVs in BRCA1 as packed boxes](/blog-img/2026-10-26-plots-and-rows/clinvar-before.png)

With a row per class, the pathogenic variants form a band across the exons.

![ClinVar SNVs in BRCA1 with a row per clinical significance](/blog-img/2026-10-26-plots-and-rows/clinvar-after.png)

The packed view stays the default. Pick **Display types** › **Multi-row feature
display (painting)** in the track menu to switch.

## ENCODE cCREs

For ENCODE's candidate regulatory elements, the rows display sorts promoters,
enhancers, CTCF sites and the other classes apart.

![ENCODE cCREs near TP53 as packed boxes](/blog-img/2026-10-26-plots-and-rows/ccre-before.png)

![ENCODE cCREs near TP53 with a row per class](/blog-img/2026-10-26-plots-and-rows/ccre-after.png)

## Mobile element insertions

The four mobile element insertion catalogs are now one track, with a row per
catalog.

![Mobile element insertions over 10 Mb of chr1, one row per catalog](/blog-img/2026-10-26-plots-and-rows/mei.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr1%3A1%2C000%2C000-11%2C000%2C000&tracks=hg38-mei)

## ClinGen CNVs

The ClinGen CNV tracks count how many reported CNVs cover each base. A new
coverage plot draws pathogenic and benign gains and losses as four rows of one
track. Over 22q11, pathogenic losses and gains pile up across the DiGeorge
region and benign CNVs barely register.

![ClinGen CNV coverage over 22q11](/blog-img/2026-10-26-plots-and-rows/clingen-after.png)

[Open this view](https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr22%3A17%2C000%2C000-27%2C000%2C000&tracks=hg38-iscaViewTotal)

The four original ClinGen CNV tracks are still listed beside the coverage plot.
