---
title: Plots and rows for UCSC tracks
date: '2026-10-26'
description: >-
  JASPAR, gnomAD and the GWAS Catalog now open as plots of their own score
  columns; ClinVar and ENCODE cCREs can split into rows; mobile element
  insertions merge into one track; and ClinGen CNVs gain a coverage plot.
---

UCSC tracks that store a number or a class in each feature (a motif score, an
allele frequency, a p-value, a clinical significance) used to draw as identical
stacked boxes. Seven tracks now plot that column or sort features into rows by
it.

- **Before** is on the left, **after** on the right; click an image to enlarge
  it.
- Each link opens the same region live in JBrowse.
- Each display is a short block of track config. No JBrowse code changed.
- To get the boxes back, pick them under **Display types** in the track menu.

## JASPAR transcription factor sites

The JASPAR track plots each site's score, -log10(p) × 100, and keeps sites with
p < 1e-5. Within 10 kb of TP53 that cuts 53,888 sites to 389, colored by strand.

<div class="before-after">
  <figure><span class="tag before">Before</span><a href="/blog-img/2026-10-26-plots-and-rows/jaspar-before.png"><img src="/blog-img/2026-10-26-plots-and-rows/jaspar-before.png" alt="JASPAR 2026 at TP53 as packed boxes" loading="lazy" /></a></figure>
  <figure><span class="tag after">After</span><a href="/blog-img/2026-10-26-plots-and-rows/jaspar-after.png"><img src="/blog-img/2026-10-26-plots-and-rows/jaspar-after.png" alt="JASPAR 2026 at TP53 as a score plot" loading="lazy" /></a></figure>
</div>

[Open before][jaspar-before] · [Open after][jaspar-after]

Zoomed in, each site spans its motif and carries its transcription factor's
name. hg38 lists only JASPAR 2026, and hg19 only JASPAR 2024.

<div class="before-after single">
  <figure><a href="/blog-img/2026-10-26-plots-and-rows/jaspar-zoomed.png"><img src="/blog-img/2026-10-26-plots-and-rows/jaspar-zoomed.png" alt="JASPAR 2026 over 150 bp, with transcription factor names" loading="lazy" /></a></figure>
</div>

## gnomAD allele frequencies

The gnomAD track plots allele frequency on a log scale, so common variants sit
at the top, and colors coding variants by consequence.

<div class="before-after">
  <figure><span class="tag before">Before</span><a href="/blog-img/2026-10-26-plots-and-rows/gnomad-before.png"><img src="/blog-img/2026-10-26-plots-and-rows/gnomad-before.png" alt="gnomAD v4.1 genomes at TP53 as packed boxes" loading="lazy" /></a></figure>
  <figure><span class="tag after">After</span><a href="/blog-img/2026-10-26-plots-and-rows/gnomad-after.png"><img src="/blog-img/2026-10-26-plots-and-rows/gnomad-after.png" alt="gnomAD v4.1 genomes at TP53 plotted by allele frequency" loading="lazy" /></a></figure>
</div>

[Open before][gnomad-before] · [Open after][gnomad-after]

## GWAS Catalog

The GWAS Catalog track opens as a Manhattan plot of -log10(p), here at the 9p21
locus near CDKN2A and CDKN2B.

<div class="before-after">
  <figure><span class="tag before">Before</span><a href="/blog-img/2026-10-26-plots-and-rows/gwas-before.png"><img src="/blog-img/2026-10-26-plots-and-rows/gwas-before.png" alt="GWAS Catalog at 9p21 as packed boxes" loading="lazy" /></a></figure>
  <figure><span class="tag after">After</span><a href="/blog-img/2026-10-26-plots-and-rows/gwas-after.png"><img src="/blog-img/2026-10-26-plots-and-rows/gwas-after.png" alt="GWAS Catalog at 9p21 as a Manhattan plot" loading="lazy" /></a></figure>
</div>

[Open this view][gwas-after]

## ClinVar

The ClinVar track can split BRCA1's variants into a row per clinical
significance. The pathogenic variants form a band across the exons. The packed
view stays the default; pick **Display types** › **Multi-row feature display
(painting)** to switch.

<div class="before-after">
  <figure><span class="tag before">Before</span><a href="/blog-img/2026-10-26-plots-and-rows/clinvar-before.png"><img src="/blog-img/2026-10-26-plots-and-rows/clinvar-before.png" alt="ClinVar SNVs in BRCA1 as packed boxes" loading="lazy" /></a></figure>
  <figure><span class="tag after">After</span><a href="/blog-img/2026-10-26-plots-and-rows/clinvar-after.png"><img src="/blog-img/2026-10-26-plots-and-rows/clinvar-after.png" alt="ClinVar SNVs in BRCA1 with a row per clinical significance" loading="lazy" /></a></figure>
</div>

[Open before][clinvar-before] · [Open after][clinvar-after]

## ENCODE cCREs

The cCRE track can sort promoters, enhancers, CTCF sites and the other classes
into rows. Switch the same way as ClinVar.

<div class="before-after">
  <figure><span class="tag before">Before</span><a href="/blog-img/2026-10-26-plots-and-rows/ccre-before.png"><img src="/blog-img/2026-10-26-plots-and-rows/ccre-before.png" alt="ENCODE cCREs near TP53 as packed boxes" loading="lazy" /></a></figure>
  <figure><span class="tag after">After</span><a href="/blog-img/2026-10-26-plots-and-rows/ccre-after.png"><img src="/blog-img/2026-10-26-plots-and-rows/ccre-after.png" alt="ENCODE cCREs near TP53 with a row per class" loading="lazy" /></a></figure>
</div>

[Open before][ccre-before] · [Open after][ccre-after]

## Mobile element insertions

The four catalogs are now one track, with a row per catalog.

<div class="before-after single">
  <figure><a href="/blog-img/2026-10-26-plots-and-rows/mei.png"><img src="/blog-img/2026-10-26-plots-and-rows/mei.png" alt="Mobile element insertions over 10 Mb of chr1, one row per catalog" loading="lazy" /></a></figure>
</div>

[Open this view][mei-after]

## ClinGen CNVs

A new ClinGen coverage plot counts the reported CNVs over each base, in four
rows of one track for pathogenic and benign gains and losses. Over 22q11,
pathogenic losses and gains pile up across the DiGeorge region and benign CNVs
barely register. The four original ClinGen CNV tracks stay listed beside it.

<div class="before-after single">
  <figure><a href="/blog-img/2026-10-26-plots-and-rows/clingen-after.png"><img src="/blog-img/2026-10-26-plots-and-rows/clingen-after.png" alt="ClinGen CNV coverage over 22q11" loading="lazy" /></a></figure>
</div>

[Open this view][clingen-after]

[jaspar-before]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&session=spec-%7B%22views%22%3A%5B%7B%22type%22%3A%22LinearGenomeView%22%2C%22assembly%22%3A%22hg38%22%2C%22loc%22%3A%22chr17%3A7%2C668%2C000-7%2C678%2C000%22%2C%22tracks%22%3A%5B%7B%22trackId%22%3A%22hg38-jaspar2026%22%2C%22type%22%3A%22LinearBasicDisplay%22%7D%5D%7D%5D%7D
[jaspar-after]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr17%3A7%2C668%2C000-7%2C678%2C000&tracks=hg38-jaspar2026
[gnomad-before]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&session=spec-%7B%22views%22%3A%5B%7B%22type%22%3A%22LinearGenomeView%22%2C%22assembly%22%3A%22hg38%22%2C%22loc%22%3A%22chr17%3A7%2C668%2C402-7%2C670%2C000%22%2C%22tracks%22%3A%5B%7B%22trackId%22%3A%22hg38-gnomadGenomesVariantsV4_1%22%2C%22type%22%3A%22LinearBasicDisplay%22%7D%5D%7D%5D%7D
[gnomad-after]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr17%3A7%2C668%2C402-7%2C670%2C000&tracks=hg38-gnomadGenomesVariantsV4_1
[gwas-after]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr9%3A21%2C900%2C000-22%2C200%2C000&tracks=hg38-gwasCatalog
[clinvar-before]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&session=spec-%7B%22views%22%3A%5B%7B%22type%22%3A%22LinearGenomeView%22%2C%22assembly%22%3A%22hg38%22%2C%22loc%22%3A%22chr17%3A43%2C044%2C295-43%2C125%2C483%22%2C%22tracks%22%3A%5B%7B%22trackId%22%3A%22hg38-clinvarMain%22%2C%22type%22%3A%22LinearBasicDisplay%22%7D%5D%7D%5D%7D
[clinvar-after]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&session=spec-%7B%22views%22%3A%5B%7B%22type%22%3A%22LinearGenomeView%22%2C%22assembly%22%3A%22hg38%22%2C%22loc%22%3A%22chr17%3A43%2C044%2C295-43%2C125%2C483%22%2C%22tracks%22%3A%5B%7B%22trackId%22%3A%22hg38-clinvarMain%22%2C%22type%22%3A%22LinearMultiRowFeatureDisplay%22%7D%5D%7D%5D%7D
[ccre-before]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&session=spec-%7B%22views%22%3A%5B%7B%22type%22%3A%22LinearGenomeView%22%2C%22assembly%22%3A%22hg38%22%2C%22loc%22%3A%22chr17%3A7%2C660%2C000-7%2C690%2C000%22%2C%22tracks%22%3A%5B%7B%22trackId%22%3A%22hg38-cCREregistry%22%2C%22type%22%3A%22LinearBasicDisplay%22%7D%5D%7D%5D%7D
[ccre-after]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&session=spec-%7B%22views%22%3A%5B%7B%22type%22%3A%22LinearGenomeView%22%2C%22assembly%22%3A%22hg38%22%2C%22loc%22%3A%22chr17%3A7%2C660%2C000-7%2C690%2C000%22%2C%22tracks%22%3A%5B%7B%22trackId%22%3A%22hg38-cCREregistry%22%2C%22type%22%3A%22LinearMultiRowFeatureDisplay%22%7D%5D%7D%5D%7D
[mei-after]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr1%3A1%2C000%2C000-11%2C000%2C000&tracks=hg38-mei
[clingen-after]:
  https://jbrowse.org/code/jb2/main/#config=https%3A%2F%2Fjbrowse.org%2Fucsc%2Fhg38%2Fconfig.json&assembly=hg38&loc=chr22%3A17%2C000%2C000-27%2C000%2C000&tracks=hg38-iscaViewTotal
