---
title: Synteny browser, conserved gene order, the protein browser and pangenomes
date: '2026-10-08'
description: >-
  Four pages leave staging: a synteny browser for any two aligned assemblies, a
  conserved gene order figure on the gene page, a protein browser that links a
  gene's exons, its 3D structure and an ortholog alignment, and pangenome graphs
  you can open at any gene or region.
---

Four pages that have been on the staging site for a while are now live.

## Synteny browser

The [synteny browser](/synteny) opens a JBrowse 2 linear synteny view of the
alignment between two assemblies. Pick the first assembly and the second list
narrows to the ones aligned to it. Add a gene and each panel opens on that gene
and its ortholog; leave it out and you get the whole genome, colored by
chromosome. [About synteny tracks](/synteny/info) lists where the alignments
come from.

## Conserved gene order

The [gene page](/gene/?gene=TP53&ref=9606) now draws the neighborhood of a gene
across species under its ortholog table: one row per species in taxonomic order,
each gene an arrow, with ribbons joining orthologs. A block that has moved,
flipped or lost a gene shows up as crossing or missing ribbons.

Everything on the figure is a launch. A gene opens a two-genome synteny view of
that gene against the reference where an alignment exists, and the single genome
otherwise. A branch point of the tree opens the species under it as one stacked
synteny view, nearest the reference first.

## Protein browser

The [protein browser](/protein-browser) takes a gene symbol and opens one
JBrowse session with three linked views of the same transcript: the gene with
its introns collapsed, the protein's 3D structure from AlphaFold or the PDB, and
an alignment of its orthologs or of a Pfam domain family. Select a residue in
any one and the other two follow, so a variant can be read as a codon, a
position in the fold and a column of the alignment at once. The page also maps
domains and binding interfaces along the protein, and each can start the session
focused on it.

## Pangenomes

The [pangenomes](/pangenomes) section has a page for each of four graphs: the
[Human Pangenome Reference Consortium](/pangenomes/hprc) release 2 graph of 232
diploid assemblies, a [mouse strain pangenome](/pangenomes/mouse), the
[bovine super-pangenome](/pangenomes/bovine) and the
[Arabidopsis 1001 Genomes Plus pangenome](/pangenomes/arabidopsis).

Each page is one box. Type a gene or a region and it lists the ways to open that
window in JBrowse 2: drawn as a graph, as the structural variants each haplotype
carries, or as the graph's bubbles on the reference where there is no callset.
The examples under the box are loci where structure is known to vary, such as
the MHC, AMY1 and the CFH cluster on the human graph, and the most variable
bubbles on the others.

On the human graph the page also reads which structural forms the haplotypes
carry in the window and how many share each one. A **Haplotypes** launch then
opens one lane per form, commonest first, each drawn in its own assembly's
coordinates with its own gene models, and a **BandageJS** link lays the same
haplotypes out as a graph.

A whole chromosome opens from its name, drawn from a coarse tier of the graph
with one node per bubble. Each page ends with the files the graph is published
as. The [HPRC tutorial](https://jbrowse.org/jb2/docs/tutorials/pangenome_hprc/)
walks through the views.

## Opening these in JBrowse Desktop

The first three can hand a launch to the desktop app. The synteny browser and
the protein browser have an **Open in Desktop 5** link beside their launch, and
the gene page has an **open in JBrowse Desktop** switch that sends every launch
on it, from the ortholog table and the gene order figure alike, to Desktop. All
of them need JBrowse Desktop 5.0, which registers the `jbrowse://` links these
use; an older Desktop does nothing when one is clicked.
