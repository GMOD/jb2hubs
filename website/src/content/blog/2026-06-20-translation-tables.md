---
title: Accurate translation tables
date: '2026-06-20'
description: >-
  Each contig now translates with its correct genetic code, so mitochondrial
  sequence is no longer read with the standard table.
---

Genomes now translate each contig with its correct genetic code. Mitochondrial
sequences, which use a different code than the nucleus (for example the
vertebrate mitochondrial code reads TGA as tryptophan rather than a stop codon),
were previously shown with the standard code. The right table is now applied
everywhere sequence is translated — the reference sequence track, the
protein/CDS panels in feature details, and the amino-acid overlay — for both
GenArk and UCSC genomes.
