---
title: The protein browser is now on genomes.jbrowse.org
date: '2026-10-12'
description: >-
  Type a gene symbol and open its exons, its 3D structure and an alignment of
  its orthologs as one linked JBrowse session, with the structure colored by
  AlphaMissense, ClinVar or AlphaFold confidence.
---

The [protein browser](/protein-browser) takes a gene symbol and opens one
JBrowse session with three linked views of the same transcript: the gene with
its introns collapsed, the protein's 3D structure from AlphaFold or the PDB, and
an alignment of its orthologs or of a Pfam domain family. Select a residue in
any one and the other two follow, so a variant reads as a codon, a position in
the fold and a column of the alignment at once.

![TP53 in the protein browser, its AlphaFold model colored by AlphaMissense](/blog-img/2026-10-12-protein-browser/tp53-alphamissense.png)

[Open TP53 in the protein browser](/protein-browser/?gene=TP53&ref=9606)

## Coloring the structure

The Color menu, under Advanced, paints the structure by:

- **AlphaMissense pathogenicity**, for human proteins, on an AlphaFold model or
  a PDB entry
- **ClinVar pathogenic variants**, for human proteins
- **AlphaFold confidence (pLDDT)**, on AlphaFold models

Colored by AlphaMissense, TP53's DNA-binding domain turns red and its disordered
ends stay blue, beside ClinVar's variants and the AlphaMissense scores on the
gene's exons.

The page also maps domains, binding partners and ligands along the protein, and
each can start the session focused on it. Its examples run from human TP53 to
the SARS-CoV-2 spike, M. tuberculosis rpoB and Arabidopsis PHYB.
